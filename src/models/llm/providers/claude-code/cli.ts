import type { ILlmProviderCompilation, ILlmProviderConnection } from '../model';
import type {
  ILlmClaudeCodeOptions,
  ILlmClaudeCodeResultEvent,
  TLlmClaudeCodeCallOptions,
  TLlmClaudeCodeEvent,
  TLlmClaudeCodeGenerateResult,
  TLlmClaudeCodeModel,
  TLlmClaudeCodeStreamPart,
  TLlmClaudeCodeStreamResult,
} from './types';

import { collectStream, collectWarnings, compilePrompt, compileSchema } from '../../utils';
import { LlmClaudeCodeError } from './errors';
import { parseJsonSafe } from '../../../../utils';
import { LlmBridge } from '../../bridge';
import { Bash } from '../../../bash';
import {
  BRIDGE_PREFIX,
  compileMcpConfig,
  compileEnv,
  convertEvent,
  convertReasoning,
  convertResult,
} from './utils';

const CLI = 'Claude Code CLI';

/** Language model which runs prompts with the Claude Code CLI in print mode */
export class LlmClaudeCodeCli implements TLlmClaudeCodeModel {
  public readonly specificationVersion = 'v4';
  public readonly provider: string = 'claude-code';
  public readonly supportedUrls: Record<string, RegExp[]> = {};

  public executable: string = this.options.executable ?? 'claude';

  constructor(
    public readonly modelId: string,
    public options: ILlmClaudeCodeOptions = {},
    public connection?: ILlmProviderConnection,

    /** Executable pipeline tools which are bridged into Claude Code via MCP and the project to run the session in */
    public compilation?: ILlmProviderCompilation
  ) {}

  /** Checks the Claude Code CLI is installed and returns its version */
  public check(): Promise<string> {
    return LlmClaudeCodeCli.check(this.executable, this.options.env);
  }

  public async doGenerate(options: TLlmClaudeCodeCallOptions): Promise<TLlmClaudeCodeGenerateResult> {
    return collectStream((await this.doStream(options)).stream);
  }

  public async doStream(options: TLlmClaudeCodeCallOptions): Promise<TLlmClaudeCodeStreamResult> {
    await this.check();

    const prompt = compilePrompt(options.prompt, CLI);
    const schema = options.responseFormat?.type === 'json' && options.responseFormat.schema
      ? compileSchema(options.responseFormat.schema)
      : undefined;

    const bridge = await LlmBridge.build(this.compilation?.tools ?? {}, options.abortSignal)?.open();

    const args = this.compileArgs({ options, bridge, schema: schema?.value, system: prompt.system });
    const warnings = prompt.warnings.concat(collectWarnings(options, CLI, Object.keys(bridge?.tools ?? {})));

    const stream = new ReadableStream<TLlmClaudeCodeStreamPart>({
      start: async (controller) => {
        const tools = new Map<string, string>();
        const context = {
          buffer: '',
          result: <ILlmClaudeCodeResultEvent | undefined>undefined,
        };

        const consume = (line: string) => {
          const parsed = parseJsonSafe<TLlmClaudeCodeEvent>(line);

          if (parsed.status === 'ERROR') {
            return;
          }
          if (parsed.result.type === 'result') {
            context.result = parsed.result;
            return;
          }

          convertEvent(parsed.result, tools).forEach((part) => controller.enqueue(part));
        };

        controller.enqueue({ type: 'stream-start', warnings });

        const executed = await Bash
          .build({ argv0: this.executable, cwd: this.compilation?.project.cwd, env: compileEnv(this.options, this.connection) })
          .exec(args, {
            stdin: prompt.user,
            signal: options.abortSignal,

            onStdout: (chunk) => {
              const lines = (context.buffer + chunk).split('\n');

              context.buffer = lines.pop() ?? '';
              lines.forEach(consume);
            },
          })
          .finally(() => bridge?.close());

        consume(context.buffer);

        const result = context.result;

        if (result && (result.is_error || result.subtype !== 'success')) {
          controller.enqueue({
            type: 'error',
            error: LlmClaudeCodeError.build(
              this.executable,
              result.errors?.join('. ') || result.result || `Got result [${result.subtype}]`,
              { args, body: JSON.stringify(result) }
            ),
          });

          return controller.close();
        }

        if (executed.status === 'ERROR' || !result) {
          controller.enqueue({
            type: 'error',
            error: executed.status === 'ERROR'
              ? LlmClaudeCodeError.build(this.executable, executed.error.stderr || executed.error.message, {
                args,
                cause: executed.error,
              })
              : LlmClaudeCodeError.build(this.executable, 'Process exited without result', { args }),
          });

          return controller.close();
        }

        const text = schema && result.structured_output !== undefined
          ? JSON.stringify(schema.extract(result.structured_output))
          : result.result ?? '';

        const id = `${result.session_id}:result`;

        controller.enqueue({ type: 'text-start', id });
        controller.enqueue({ type: 'text-delta', id, delta: text });
        controller.enqueue({ type: 'text-end', id });

        controller.enqueue(convertResult(result));
        controller.close();
      },
    });

    return {
      stream,
      request: { body: { args, prompt: prompt.user } },
    };
  }

  /**
   * Compiles CLI arguments of the print mode
   * The session runs in `dontAsk` mode: built-in tools from options and bridged pipeline tools are allowed, others are denied
   */
  private compileArgs(provided: {
    options: TLlmClaudeCodeCallOptions;
    bridge?: LlmBridge;

    schema?: object;
    system?: string;
  }): string[] {
    const { bridge } = provided;
    const effort = convertReasoning(provided.options.reasoning);

    const tools = this.options.tools ?? [];
    const allowed = [...tools, ...(bridge ? [`mcp__${bridge.name}`] : [])];

    const system = [
      provided.system,

      ...(bridge
        ? [`Pipeline tools are provided by \`${bridge.name}\` MCP server: a tool referenced as \`read\` is called \`${BRIDGE_PREFIX}read\``]
        : []),
    ].filter(Boolean).join('\n\n');

    return [
      '--print',
      '--verbose',
      '--output-format', 'stream-json',

      '--no-session-persistence',
      '--strict-mcp-config',
      '--permission-mode', 'dontAsk',

      '--tools', tools.join(','),

      ...(this.modelId !== 'default' ? ['--model', this.modelId] : []),
      ...(effort ? ['--effort', effort] : []),

      ...(system ? [this.options.system === 'append' ? '--append-system-prompt' : '--system-prompt', system] : []),
      ...(provided.schema ? ['--json-schema', JSON.stringify(provided.schema)] : []),

      ...(allowed.length ? ['--allowed-tools', allowed.join(',')] : []),
      ...(bridge ? ['--mcp-config', JSON.stringify(compileMcpConfig(bridge))] : []),
      ...(this.options.budget !== undefined ? ['--max-budget-usd', String(this.options.budget)] : []),

      ...(this.options.args ?? []),
    ];
  }

  private static checks = new Map<string, Promise<string>>();

  static build(
    modelId: string,
    options?: ILlmClaudeCodeOptions,
    connection?: ILlmProviderConnection,
    compilation?: ILlmProviderCompilation
  ): LlmClaudeCodeCli {
    return new LlmClaudeCodeCli(modelId, options, connection, compilation);
  }

  /** Checks the Claude Code CLI is installed and returns its version (the successful result is cached) */
  static check(executable: string = 'claude', env?: ILlmClaudeCodeOptions['env']): Promise<string> {
    const cached = LlmClaudeCodeCli.checks.get(executable);
    if (cached) {
      return cached;
    }

    const promise = Bash
      .build({ argv0: executable, env })
      .exec(['--version'])
      .then((executed) => {
        if (executed.status === 'OK') {
          return executed.stdout.trim();
        }

        throw LlmClaudeCodeError.build(
          executable,
          (<NodeJS.ErrnoException | undefined>executed.error.source)?.code === 'ENOENT'
            ? 'executable is not found'
            : executed.error.stderr || executed.error.message,
          { args: ['--version'], cause: executed.error }
        );
      });

    LlmClaudeCodeCli.checks.set(executable, promise);
    promise.catch(() => LlmClaudeCodeCli.checks.delete(executable));

    return promise;
  }
}
