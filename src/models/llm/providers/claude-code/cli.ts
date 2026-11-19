import type { ILlmProviderConnection } from '../model';
import type { Tool } from 'ai';
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

import { LlmClaudeCodeBridge } from './bridge';
import { LlmClaudeCodeError } from './errors';
import { parseJsonSafe } from '../../../../utils';
import { Bash } from '../../../bash';
import {
  BRIDGE_NAME,
  BRIDGE_PREFIX,
  collectWarnings,
  compilePrompt,
  compileSchema,
  compileEnv,
  convertEvent,
  convertReasoning,
  convertResult,
  convertUsage,
} from './utils';

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

    /** Executable pipeline tools which are bridged into Claude Code via MCP */
    public tools: Record<string, Tool> = {}
  ) {}

  /** Checks the Claude Code CLI is installed and returns its version */
  public check(): Promise<string> {
    return LlmClaudeCodeCli.check(this.executable, this.options.env);
  }

  public async doGenerate(options: TLlmClaudeCodeCallOptions): Promise<TLlmClaudeCodeGenerateResult> {
    const { stream } = await this.doStream(options);

    const result: TLlmClaudeCodeGenerateResult = {
      content: [],
      warnings: [],

      finishReason: { unified: 'other', raw: undefined },
      usage: convertUsage(),
    };

    const reader = stream.getReader();

    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      const part = chunk.value;

      switch (part.type) {
        case 'stream-start': result.warnings.push(...part.warnings); continue;
        case 'text-delta': result.content.push({ type: 'text', text: part.delta }); continue;
        case 'reasoning-delta': result.content.push({ type: 'reasoning', text: part.delta }); continue;
        case 'tool-call': result.content.push(part); continue;
        case 'tool-result': result.content.push(part); continue;
        case 'error': throw part.error;

        case 'finish': {
          Object.assign(result, {
            finishReason: part.finishReason,
            usage: part.usage,
            providerMetadata: part.providerMetadata,
          });

          continue;
        }
      }
    }

    return result;
  }

  public async doStream(options: TLlmClaudeCodeCallOptions): Promise<TLlmClaudeCodeStreamResult> {
    await this.check();

    const prompt = compilePrompt(options.prompt);
    const schema = options.responseFormat?.type === 'json' && options.responseFormat.schema
      ? compileSchema(options.responseFormat.schema)
      : undefined;

    const bridge = LlmClaudeCodeBridge.build(
      this.tools,
      options.tools?.flatMap((tool) => tool.type === 'function' ? [tool] : []),
      options.abortSignal
    );

    if (bridge.names.length) {
      await bridge.open();
    }

    const args = this.compileArgs({ options, bridge, schema: schema?.value, system: prompt.system });
    const warnings = prompt.warnings.concat(collectWarnings(options, bridge.names));

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
          .build({ argv0: this.executable, cwd: this.options.cwd, env: compileEnv(this.options, this.connection) })
          .exec(args, {
            stdin: prompt.user,
            signal: options.abortSignal,

            onStdout: (chunk) => {
              const lines = (context.buffer + chunk).split('\n');

              context.buffer = lines.pop() ?? '';
              lines.forEach(consume);
            },
          })
          .finally(() => bridge.close());

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

  /** Compiles CLI arguments of the print mode (bridged pipeline tools are allowed without a permission prompt) */
  private compileArgs(provided: {
    options: TLlmClaudeCodeCallOptions;
    bridge: LlmClaudeCodeBridge;

    schema?: object;
    system?: string;
  }): string[] {
    const effort = convertReasoning(provided.options.reasoning);
    const bridged = provided.bridge.names.length > 0;

    const mcp = [...(this.options.mcp ?? []), ...(bridged ? [JSON.stringify(provided.bridge.config)] : [])];
    const allowed = [...(this.options.allowedTools ?? []), ...(bridged ? [`mcp__${BRIDGE_NAME}`] : [])];

    const system = [
      provided.system,

      ...(bridged
        ? [`Pipeline tools are provided by \`${BRIDGE_NAME}\` MCP server: a tool referenced as \`read\` is called \`${BRIDGE_PREFIX}read\``]
        : []),
    ].filter(Boolean).join('\n\n');

    return [
      '--print',
      '--verbose',
      '--output-format', 'stream-json',

      '--no-session-persistence',
      '--strict-mcp-config',

      '--tools', (this.options.tools ?? []).join(','),

      ...(this.modelId !== 'default' ? ['--model', this.modelId] : []),
      ...(effort ? ['--effort', effort] : []),

      ...(system ? [this.options.system === 'append' ? '--append-system-prompt' : '--system-prompt', system] : []),
      ...(provided.schema ? ['--json-schema', JSON.stringify(provided.schema)] : []),

      ...(allowed.length ? ['--allowed-tools', allowed.join(',')] : []),
      ...(this.options.disallowedTools?.length ? ['--disallowed-tools', this.options.disallowedTools.join(',')] : []),

      ...(this.options.permissionMode ? ['--permission-mode', this.options.permissionMode] : []),
      ...(mcp.length ? ['--mcp-config', ...mcp] : []),
      ...(this.options.budget !== undefined ? ['--max-budget-usd', String(this.options.budget)] : []),

      ...(this.options.args ?? []),
    ];
  }

  private static checks = new Map<string, Promise<string>>();

  static build(
    modelId: string,
    options?: ILlmClaudeCodeOptions,
    connection?: ILlmProviderConnection,
    tools?: Record<string, Tool>
  ): LlmClaudeCodeCli {
    return new LlmClaudeCodeCli(modelId, options, connection, tools);
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
