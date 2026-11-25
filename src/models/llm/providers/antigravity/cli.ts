import fs from 'fs/promises';
import path from 'path';
import os from 'os';

import type { ILlmAntigravityOptions, ILlmAntigravityResult, TLlmAntigravityEvent } from './types';
import type { ILlmProviderCompilation, ILlmProviderConnection } from '../model';
import type {
  TLlmCallOptions,
  TLlmGenerateResult,
  TLlmLanguageModel,
  TLlmStreamPart,
  TLlmStreamResult,
} from '../../types';

import { collectStream, collectWarnings, compilePrompt, compileSchema } from '../../utils';
import { LlmAntigravityError } from './errors';
import { parseJsonSafe } from '../../../../utils';
import { LlmBridge } from '../../bridge';
import { Bash } from '../../../bash';
import {
  AGENT_NAME,
  BRIDGE_PREFIX,
  compileAgent,
  compileEnv,
  compileMcpConfig,
  compileSettings,
  convertError,
  convertEvent,
  convertFinish,
  convertReasoning,
} from './utils';

const CLI = 'Antigravity CLI';

/** Language model which runs prompts with the Antigravity CLI in print mode */
export class LlmAntigravityCli implements TLlmLanguageModel {
  public readonly specificationVersion = 'v4';
  public readonly provider: string = 'antigravity';
  public readonly supportedUrls: Record<string, RegExp[]> = {};

  public executable: string = this.options.executable ?? 'agy';

  constructor(
    public readonly modelId: string,
    public options: ILlmAntigravityOptions = {},
    public connection?: ILlmProviderConnection,

    /** Executable pipeline tools which are bridged into Antigravity via MCP and the project to run the session in */
    public compilation?: ILlmProviderCompilation
  ) {}

  /** Checks the Antigravity CLI is installed and returns its version */
  public check(): Promise<string> {
    return LlmAntigravityCli.check(this.executable, this.options.env);
  }

  public async doGenerate(options: TLlmCallOptions): Promise<TLlmGenerateResult> {
    return collectStream((await this.doStream(options)).stream);
  }

  public async doStream(options: TLlmCallOptions): Promise<TLlmStreamResult> {
    await this.check();

    const prompt = compilePrompt(options.prompt, CLI);
    const schema = options.responseFormat?.type === 'json' && options.responseFormat.schema
      ? compileSchema(options.responseFormat.schema)
      : undefined;

    const bridge = await LlmBridge.build(this.compilation?.tools ?? {}, options.abortSignal)?.open();
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pipelain-antigravity-'));

    const system = [
      prompt.system,

      ...(bridge
        ? [`Pipeline tools are provided by \`${bridge.name}\` MCP server: a tool referenced as \`read\` is called \`${BRIDGE_PREFIX}read\``]
        : []),
    ].filter(Boolean).join('\n\n');

    await fs.mkdir(path.join(directory, '.agents', 'agents', AGENT_NAME), { recursive: true });
    await fs.writeFile(path.join(directory, '.agents', 'agents', AGENT_NAME, 'agent.md'), compileAgent(this.options, { system, structured: Boolean(schema) }));

    if (bridge) {
      await fs.writeFile(path.join(directory, '.agents', 'mcp_config.json'), JSON.stringify(compileMcpConfig(bridge)), { mode: 0o600 });
    }

    const args = this.compileArgs({ options, schema: schema?.value, directory });
    const warnings = prompt.warnings.concat(collectWarnings(options, CLI, Object.keys(bridge?.tools ?? {})));

    const input = prompt.user;

    const stream = new ReadableStream<TLlmStreamPart>({
      start: async (controller) => {
        const called = new Set<string>();
        const context = {
          buffer: '',
          events: <string[]>[],
          result: <ILlmAntigravityResult | undefined>undefined,
        };

        const consume = (line: string) => {
          const parsed = parseJsonSafe<TLlmAntigravityEvent>(line);

          if (parsed.status === 'ERROR' || !parsed.result?.event) {
            return;
          }

          context.events.push(line);

          if (parsed.result.event === 'result') {
            context.result = parsed.result.result;
            return;
          }

          convertEvent(parsed.result, called).forEach((part) => controller.enqueue(part));
        };

        controller.enqueue({ type: 'stream-start', warnings });

        const executed = await Bash
          .build({ argv0: this.executable, cwd: this.compilation?.project.cwd, env: compileEnv(this.options, this.connection) })
          .exec(args, {
            stdin: `${JSON.stringify({ event: 'user', message: { content: input } })}\n`,
            signal: options.abortSignal,

            onStdout: (chunk) => {
              const lines = (context.buffer + chunk).split('\n');

              context.buffer = lines.pop() ?? '';
              lines.forEach(consume);
            },
          })
          .finally(() => Promise.all([
            bridge?.close(),
            fs.rm(directory, { recursive: true, force: true }),
          ]));

        consume(context.buffer);

        const result = context.result;

        if (result && result.status !== 'SUCCESS') {
          controller.enqueue({
            type: 'error',
            error: LlmAntigravityError.build(this.executable, convertError(result), { args, body: context.events.join('\n') }),
          });

          return controller.close();
        }

        if (executed.status === 'ERROR' || !result) {
          controller.enqueue({
            type: 'error',
            error: executed.status === 'ERROR'
              ? LlmAntigravityError.build(this.executable, executed.error.stderr || executed.error.message, {
                args,
                body: context.events.join('\n'),
                cause: executed.error,
              })
              : LlmAntigravityError.build(this.executable, 'Process exited without result', { args }),
          });

          return controller.close();
        }

        const text = schema && result.structured_output !== undefined
          ? JSON.stringify(schema.extract(result.structured_output))
          : result.response ?? '';

        const id = `${result.conversation_id}:result`;

        controller.enqueue({ type: 'text-start', id });
        controller.enqueue({ type: 'text-delta', id, delta: text });
        controller.enqueue({ type: 'text-end', id });

        controller.enqueue(convertFinish(result));
        controller.close();
      },
    });

    return {
      stream,
      request: { body: { args, system, prompt: input } },
    };
  }

  /**
   * Compiles CLI arguments of the print mode (the prompt is read from stdin as `stream-json` message)
   * The session runs as the custom agent without default tools and auto-approves all the tool calls
   * The agent definition and the bridge config are placed into a temporary directory which is added to the workspace
   */
  private compileArgs(provided: {
    options: TLlmCallOptions;

    schema?: object;
    directory: string;
  }): string[] {
    const effort = convertReasoning(provided.options.reasoning);

    return [
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',

      '--dangerously-skip-permissions',
      '--disable-slash-commands',

      '--settings', JSON.stringify(compileSettings(this.options, this.connection)),

      ...(this.modelId !== 'default' ? ['--model', this.modelId] : []),
      ...(effort ? ['--effort', effort] : []),

      '--add-dir', provided.directory,
      '--agent', AGENT_NAME,

      ...(provided.schema ? ['--json-schema', JSON.stringify(provided.schema)] : []),

      ...(this.options.args ?? []),
    ];
  }

  private static checks = new Map<string, Promise<string>>();

  static build(
    modelId: string,
    options?: ILlmAntigravityOptions,
    connection?: ILlmProviderConnection,
    compilation?: ILlmProviderCompilation
  ): LlmAntigravityCli {
    return new LlmAntigravityCli(modelId, options, connection, compilation);
  }

  /** Checks the Antigravity CLI is installed and returns its version (the successful result is cached) */
  static check(executable: string = 'agy', env?: ILlmAntigravityOptions['env']): Promise<string> {
    const cached = LlmAntigravityCli.checks.get(executable);
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

        throw LlmAntigravityError.build(
          executable,
          (<NodeJS.ErrnoException | undefined>executed.error.source)?.code === 'ENOENT'
            ? 'executable is not found'
            : executed.error.stderr || executed.error.message,
          { args: ['--version'], cause: executed.error }
        );
      });

    LlmAntigravityCli.checks.set(executable, promise);
    promise.catch(() => LlmAntigravityCli.checks.delete(executable));

    return promise;
  }
}
