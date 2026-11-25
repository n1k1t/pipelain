import fs from 'fs/promises';
import path from 'path';
import os from 'os';

import type { ILlmCodexOptions, ILlmCodexUsage, TLlmCodexEvent } from './types';
import type { ILlmProviderCompilation, ILlmProviderConnection } from '../model';
import type {
  TLlmCallOptions,
  TLlmGenerateResult,
  TLlmLanguageModel,
  TLlmStreamPart,
  TLlmStreamResult,
} from '../../types';

import { collectStream, collectWarnings, compilePrompt, compileSchema } from '../../utils';
import { LlmCodexError } from './errors';
import { parseJsonSafe } from '../../../../utils';
import { LlmBridge } from '../../bridge';
import { Bash } from '../../../bash';
import {
  compileBridgeConfig,
  compileConfig,
  compileEnv,
  compileToolsConfig,
  convertEvent,
  convertFinish,
  convertReasoning,
  sanitizeSchema,
} from './utils';

const CLI = 'Codex CLI';

/** Language model which runs prompts with the Codex CLI in exec mode */
export class LlmCodexCli implements TLlmLanguageModel {
  public readonly specificationVersion = 'v4';
  public readonly provider: string = 'codex';
  public readonly supportedUrls: Record<string, RegExp[]> = {};

  public executable: string = this.options.executable ?? 'codex';

  constructor(
    public readonly modelId: string,
    public options: ILlmCodexOptions = {},
    public connection?: ILlmProviderConnection,

    /** Executable pipeline tools which are bridged into Codex via MCP and the project to run the session in */
    public compilation?: ILlmProviderCompilation
  ) {}

  /** Checks the Codex CLI is installed and returns its version */
  public check(): Promise<string> {
    return LlmCodexCli.check(this.executable, this.options.env);
  }

  public async doGenerate(options: TLlmCallOptions): Promise<TLlmGenerateResult> {
    return collectStream((await this.doStream(options)).stream);
  }

  public async doStream(options: TLlmCallOptions): Promise<TLlmStreamResult> {
    await this.check();

    const prompt = compilePrompt(options.prompt, CLI);
    const schema = options.responseFormat?.type === 'json' && options.responseFormat.schema
      ? compileSchema(<object>sanitizeSchema(options.responseFormat.schema))
      : undefined;

    const bridge = await LlmBridge.build(this.compilation?.tools ?? {}, options.abortSignal)?.open();
    const directory = schema ? await fs.mkdtemp(path.join(os.tmpdir(), 'pipelain-codex-')) : undefined;
    const location = directory ? path.join(directory, 'schema.json') : undefined;

    if (location && schema) {
      await fs.writeFile(location, JSON.stringify({ ...schema.value, additionalProperties: false }));
    }

    const args = this.compileArgs({ options, bridge, schema: location });
    const warnings = prompt.warnings.concat(collectWarnings(options, CLI, Object.keys(bridge?.tools ?? {})));

    const input = [
      prompt.system,

      ...(bridge ? [`Pipeline tools are provided by \`${bridge.name}\` MCP server`] : []),
      prompt.user,
    ].filter(Boolean).join('\n\n');

    const stream = new ReadableStream<TLlmStreamPart>({
      start: async (controller) => {
        const called = new Set<string>();
        const context = {
          buffer: '',
          events: <string[]>[],

          text: <string | undefined>undefined,
          thread: <string | undefined>undefined,
          usage: <ILlmCodexUsage | undefined>undefined,

          completed: false,
          failure: <string | undefined>undefined,
        };

        const consume = (line: string) => {
          const parsed = parseJsonSafe<TLlmCodexEvent>(line);

          if (parsed.status === 'ERROR' || !parsed.result?.type) {
            return;
          }

          const event = parsed.result;
          context.events.push(line);

          switch (event.type) {
            case 'thread.started': context.thread = event.thread_id; break;
            case 'turn.completed': Object.assign(context, { completed: true, usage: event.usage }); break;
            case 'turn.failed': context.failure = event.error?.message ?? 'Turn is failed'; break;
            case 'error': context.failure ??= event.message ?? 'Got error event'; break;

            case 'item.completed': {
              if (event.item.type === 'agent_message' && typeof event.item.text === 'string') {
                context.text = event.item.text;
              }

              break;
            }
          }

          convertEvent(event, called).forEach((part) => controller.enqueue(part));
        };

        controller.enqueue({ type: 'stream-start', warnings });

        const executed = await Bash
          .build({ argv0: this.executable, cwd: this.compilation?.project.cwd, env: compileEnv(this.options, this.connection, bridge) })
          .exec(args, {
            stdin: input,
            signal: options.abortSignal,

            onStdout: (chunk) => {
              const lines = (context.buffer + chunk).split('\n');

              context.buffer = lines.pop() ?? '';
              lines.forEach(consume);
            },
          })
          .finally(() => Promise.all([
            bridge?.close(),
            directory && fs.rm(directory, { recursive: true, force: true }),
          ]));

        consume(context.buffer);

        if (context.failure || executed.status === 'ERROR' || !context.completed) {
          const reason = context.failure
            ?? (executed.status === 'ERROR' ? executed.error.stderr || executed.error.message : 'Process exited without result');

          controller.enqueue({
            type: 'error',
            error: LlmCodexError.build(this.executable, reason, {
              args,
              body: context.events.join('\n'),
              ...(executed.status === 'ERROR' && { cause: executed.error }),
            }),
          });

          return controller.close();
        }

        const parsed = schema && context.text ? parseJsonSafe(context.text) : undefined;
        const text = schema && parsed?.status === 'OK'
          ? JSON.stringify(schema.extract(parsed.result))
          : context.text ?? '';

        const id = `${context.thread ?? 'codex'}:result`;

        controller.enqueue({ type: 'text-start', id });
        controller.enqueue({ type: 'text-delta', id, delta: text });
        controller.enqueue({ type: 'text-end', id });

        controller.enqueue(convertFinish({ thread: context.thread, usage: context.usage }));
        controller.close();
      },
    });

    return {
      stream,
      request: { body: { args, prompt: input } },
    };
  }

  /**
   * Compiles CLI arguments of the exec mode (the prompt is read from stdin)
   * The session runs without sandbox and approvals, only built-in tools from options and bridged pipeline tools are enabled
   * Project instructions (`AGENTS.md`) are not loaded, the step prompt is the only source of instructions (`project_doc_max_bytes` in config enables them)
   */
  private compileArgs(provided: {
    options: TLlmCallOptions;
    bridge?: LlmBridge;

    schema?: string;
  }): string[] {
    const effort = convertReasoning(provided.options.reasoning);

    return [
      'exec',
      '--json',
      '--skip-git-repo-check',

      '--sandbox', 'danger-full-access',

      ...(this.modelId !== 'default' ? ['--model', this.modelId] : []),
      ...(provided.schema ? ['--output-schema', provided.schema] : []),

      ...compileConfig({
        approval_policy: 'never',
        project_doc_max_bytes: 0,

        ...compileToolsConfig(this.options.tools),
        ...(effort && { model_reasoning_effort: effort }),
        ...(provided.bridge && compileBridgeConfig(provided.bridge)),

        ...this.options.config,
      }),

      ...(this.options.args ?? []),
      '-',
    ];
  }

  private static checks = new Map<string, Promise<string>>();

  static build(
    modelId: string,
    options?: ILlmCodexOptions,
    connection?: ILlmProviderConnection,
    compilation?: ILlmProviderCompilation
  ): LlmCodexCli {
    return new LlmCodexCli(modelId, options, connection, compilation);
  }

  /** Checks the Codex CLI is installed and returns its version (the successful result is cached) */
  static check(executable: string = 'codex', env?: ILlmCodexOptions['env']): Promise<string> {
    const cached = LlmCodexCli.checks.get(executable);
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

        throw LlmCodexError.build(
          executable,
          (<NodeJS.ErrnoException | undefined>executed.error.source)?.code === 'ENOENT'
            ? 'executable is not found'
            : executed.error.stderr || executed.error.message,
          { args: ['--version'], cause: executed.error }
        );
      });

    LlmCodexCli.checks.set(executable, promise);
    promise.catch(() => LlmCodexCli.checks.delete(executable));

    return promise;
  }
}
