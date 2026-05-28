import { FlexibleSchema, tool, Tool, ToolExecuteFunction } from 'ai';

import type { PipelineParameters, PipelineStep } from '../../pipeline';
import type { VirtualFileSystem } from '../../vfs';

import { BashExecError } from '../../bash';

export interface ILlmToolParameters<TOptions extends object> extends PipelineParameters {
  options: TOptions;

  step: PipelineStep;
  vfs: VirtualFileSystem;
}

export class LlmToolCompilationError extends Error {
  constructor(public property: string) {
    super(`Cannot compile without [${property}] property`);
  }
}

export class LlmToolExecutionError extends Error {
  constructor(public name: string, reason: string) {
    super(`Execution of [${name}] has failed: ${reason}`);
  }

  static build(name: string, source: unknown): LlmToolExecutionError {
    const reason = source instanceof BashExecError
      ? source.stderr
      : source instanceof Error
        ? source.message
        : Array.isArray(source)
          ? source.join('. ')
          : String(source);

    return new LlmToolExecutionError(name, reason);
  }
}

export class LlmToolCompiler<TSchema extends {
  input: unknown;
  output: unknown;
  options: {};
} = any> {
  public TOptions!: TSchema['options'];
  public TExecutor!: (parameters: ILlmToolParameters<TSchema['options']>) => ToolExecuteFunction<
    TSchema['input'],
    TSchema['output']
  >;

  constructor(public description: string, protected provided: {
    executor?: LlmToolCompiler<TSchema>['TExecutor'];
    options?: TSchema['options'];

    schema: {
      input?: FlexibleSchema<TSchema['input']>;
      output?: FlexibleSchema<TSchema['output']>;
    };
  }) {}

  public input<T, U extends LlmToolCompiler<{ input: T, output: TSchema['output'], options: TSchema['options'] }>>(
    schema: FlexibleSchema<T>
  ): U {
    this.provided.schema.input = schema;
    return <this & U>this;
  }

  public output<T, U extends LlmToolCompiler<{ input: TSchema['input'], output: T, options: TSchema['options'] }>>(
    schema: FlexibleSchema<T>
  ): U {
    this.provided.schema.output = schema;
    return <this & U>this;
  }

  /** Provides options to tool (makes clone of this instance) */
  public options(payload: TSchema['options']): this {
    const clone = new LlmToolCompiler<TSchema>(this.description, {
      executor: this.provided.executor,
      schema: this.provided.schema,

      options: payload,
    });

    return <this>clone;
  }

  public execute(executor: NonNullable<LlmToolCompiler<TSchema>['TExecutor']>): this {
    this.provided.executor = executor;
    return this;
  }

  public compile(parameters: Omit<ILlmToolParameters<any>, 'options'>): Tool<TSchema['input'], TSchema['output']> {
    if (!this.provided.executor) {
      throw new LlmToolCompilationError('executor');
    }

    return tool(<Tool>{
      description: this.description,

      execute: this.provided.executor(
        parameters.extend({
          vfs: parameters.vfs,
          step: parameters.step,
          options: this.provided.options ?? {},
        })
      ),

      inputSchema: this.provided.schema.input,
      outputSchema: this.provided.schema.output,
    });
  }

  static build<TOptions extends object = {}, TOutput = any>(description: string): LlmToolCompiler<{
    input: unknown;
    output: TOutput;
    options: TOptions;
  }> {
    return new LlmToolCompiler(description, { schema: {} });
  }
}
