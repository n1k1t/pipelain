import { Tool } from 'ai';

import type { PipelineSession } from '../pipeline/session';
import type { PipelineContext } from '../pipeline/context';
import type { PipelineStep } from '../pipeline/steps';
import type { TFunction } from '../../../types';

import { LlmToolCompiler } from './tools/model';

interface ILlmHookBuildOptions {
  /** Matched tool name */
  name?: string;
}

interface ILlmHookSchema {
  output: unknown;
  input: unknown;
}

interface ILlmHookBeforeParameters<TSchema extends ILlmHookSchema> {
  session: PipelineSession;
  context: PipelineContext;
  step: PipelineStep;

  input: TSchema['input'];
  next: TFunction<TSchema['output'] | Promise<TSchema['output']>, [TSchema['input']]>;
}

interface ILlmHookAfterParameters<TSchema extends ILlmHookSchema> {
  session: PipelineSession;
  context: PipelineContext;
  step: PipelineStep;

  output: PromiseSettledResult<TSchema['output']>;
  input: TSchema['input'];
}

export class LlmHook<TSchema extends ILlmHookSchema = any> {
  public TSchema!: TSchema;

  protected handlers: {
    before: TFunction<TSchema['output'] | Promise<TSchema['output']>, [ILlmHookBeforeParameters<TSchema>]>;
    after: TFunction<TSchema['output'] | Promise<TSchema['output']>, [ILlmHookAfterParameters<TSchema>]>;
  } = {
    before: ({ next, input }) => next(input),
    after: ({ output }) => {
      if (output.status === 'rejected') {
        throw output.reason;
      }

      return output.value;
    },
  };

  constructor (protected provided: {
    name?: string;

    compiler?: LlmToolCompiler;
    tool?: Tool;
  }) {}

  /**
   * Sets handler that runs instead of original tool `execute`.
   * Original `execute` runs only on `next` call, so handler can modify input, override output or skip execution.
   * Returned value (or thrown error) is passed to `after` handler as `output`.
   *
   * @example
   * // Modify input before execution
   * LlmHook.build<{ input: { path: string } }>('read')
   *   .before(({ input, next }) => next({ ...input, path: input.path.trim() }));
   *
   * @example
   * // Skip execution and return cached output
   * LlmHook.build(compiler)
   *   .before(async ({ input, next }) => cache.get(input) ?? next(input));
   *
   * @example
   * // Deny execution
   * LlmHook.build(tool)
   *   .before(({ context, input, next }) => {
   *     if (!context.allowed) {
   *       throw LlmToolExecutionError.build('Tool execution is not allowed');
   *     }
   *
   *     return next(input);
   *   });
   */
  public before(handler: LlmHook<TSchema>['handlers']['before']): this {
    this.handlers.before = handler;
    return this;
  }

  /**
   * Sets handler that runs after `before` handler (and original tool `execute`) is settled.
   * Receives `output` as `PromiseSettledResult`, so handler can handle errors, modify output or rethrow.
   * Returned value is final tool output. By default rethrows rejected reason or returns fulfilled value.
   *
   * @example
   * // Modify output
   * LlmHook.build<{ output: string }>('read')
   *   .after(({ output }) => {
   *     if (output.status === 'rejected') {
   *       throw output.reason;
   *     }
   *
   *     return output.value.slice(0, 1000);
   *   });
   *
   * @example
   * // Convert error into readable reason for LLM ("Execution failed: <reason>")
   * LlmHook.build(compiler)
   *   .after(({ output }) => {
   *     if (output.status === 'rejected') {
   *       throw LlmToolExecutionError.build(output.reason);
   *     }
   *
   *     return output.value;
   *   });
   */
  public after(handler: LlmHook<TSchema>['handlers']['after']): this {
    this.handlers.after = handler;
    return this;
  }

  public belongs(target: {
    name?: string;

    compiler?: LlmToolCompiler;
    tool?: Tool;
  }): boolean {
    if (this.provided.name && target.name) {
      return this.provided.name === target.name;
    }
    if (this.provided.compiler && target.compiler) {
      return this.provided.compiler.origin === target.compiler.origin;
    }
    if (this.provided.tool && target.tool) {
      return this.provided.tool === target.tool;
    }

    return false;
  }

  public wrap(tool: Tool, parameters: {
    session: PipelineSession;
    context: PipelineContext;
    step: PipelineStep;
  }): this {
    const execute = tool.execute;
    if (!execute) {
      return this;
    }

    tool.execute = async (input, options) => {
      const [output] = await Promise.allSettled([
        Promise.resolve().then(() => this.handlers.before({
          ...parameters,

          input,
          next: (payload) => <TSchema['output'] | Promise<TSchema['output']>>execute.call(tool, payload, options),
        })),
      ]);

      return this.handlers.after({
        ...parameters,

        output,
        input,
      });
    };

    return this;
  }

  static build<T extends Partial<ILlmHookSchema>>(name: string): LlmHook<{
    output: T['output'];
    input: T['input'];
  }>;

  static build<T extends {
    output: unknown;
    input: unknown;
    options: any;
  }>(compiler: LlmToolCompiler<T>, options?: ILlmHookBuildOptions): LlmHook<{
    output: T['output'];
    input: T['input'];
  }>;

  static build<TInput, TOutput = unknown>(
    tool: Tool<TInput, TOutput>,
    options?: ILlmHookBuildOptions
  ): LlmHook<{
    output: TOutput;
    input: TInput;
  }>;

  static build(
    nameOrToolOrCompiler: string | Tool | LlmToolCompiler,
    options?: ILlmHookBuildOptions
  ): LlmHook {
    if (nameOrToolOrCompiler instanceof LlmToolCompiler) {
      return new LlmHook({
        compiler: nameOrToolOrCompiler,
        name: options?.name,
      });
    }

    if (typeof nameOrToolOrCompiler === 'string') {
      return new LlmHook({ name: nameOrToolOrCompiler });
    }

    return new LlmHook({
      tool: nameOrToolOrCompiler,
      name: options?.name,
    });
  }
}
