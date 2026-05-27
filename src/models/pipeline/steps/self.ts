import { ZodType } from 'zod/v3';

import { IPipelineStepDefinition, IPipelineStepSource, PipelineStep, PipelineStepCompiler } from './model';
import { TPipelineStepNestedHandler, TPipelineStepType } from './types';
import { PipelineStepCompilationError } from './errors';
import { IPipelineConfiguration } from '../types';
import { PipelineParameters } from '../parameters';
import { buildMetaManager } from '../../../utils';

interface IDefinition<TConfiguration extends IPipelineConfiguration, TSchema> extends IPipelineStepDefinition {
  exec: TPipelineStepNestedHandler<TConfiguration, TSchema>;
  schema?: ZodType | TPipelineStepNestedHandler<TConfiguration, ZodType>;
}

export class PipelineSelfStepCompiler<
  TConfiguration extends IPipelineConfiguration = any,
  TSchema = any
> extends PipelineStepCompiler<TSchema> {
  private type: Extract<TPipelineStepType, 'self'> = 'self';

  constructor(private definition: Partial<IDefinition<TConfiguration, TSchema>>) {
    super();
  }

  /** Provides schema to check output payload it self */
  public schema<T, TReturn extends PipelineSelfStepCompiler<TConfiguration, T>>(
    predicate: ZodType<T> | TPipelineStepNestedHandler<TConfiguration, ZodType<T>>
  ): TReturn {
    this.definition.schema = predicate;
    return <this & TReturn>this;
  }

  /** Provides executor */
  public exec<T extends TSchema, TReturn extends PipelineSelfStepCompiler<TConfiguration, T>>(
    handler: TPipelineStepNestedHandler<TConfiguration, T>
  ): TReturn {
    this.definition.exec = handler;
    return <this & TReturn>this;
  }

  public compile(provided: IPipelineStepSource): PipelineSelfStep<TConfiguration, TSchema> {
    if (!this.definition.exec) {
      throw new PipelineStepCompilationError(this.type, '[exec] is missing');
    }

    return new PipelineSelfStep(this.type, {
      title: this.definition.title,

      exec: this.definition.exec,
      schema: this.definition.schema,

      pipeline: provided.pipeline,
      parent: provided.parent,
    });
  }

  static build<TConfiguration extends IPipelineConfiguration, TSchema>(
    title?: string
  ): PipelineSelfStepCompiler<TConfiguration, TSchema> {
    return new PipelineSelfStepCompiler({ title });
  }
}

export class PipelineSelfStep<
  TConfiguration extends IPipelineConfiguration = any,
  TSchema = any
> extends PipelineStep<'self', TConfiguration, TSchema, IDefinition<TConfiguration, TSchema>> {
  public async run(parameters: PipelineParameters<TConfiguration>): Promise<TSchema> {
    const meta = buildMetaManager();

    this.pipeline.session.emit('step:run', { step: this, meta: meta.init() });

    try {
      const schema = this.definition.schema
        ? typeof this.definition.schema === 'function'
          ? await this.definition.schema(parameters)
          : this.definition.schema
        : null;

      const result = await this.definition.exec(parameters);
      await schema?.parseAsync(result);

      this.pipeline.session.emit('step:run', { step: this, meta: meta.done() });
      return result;
    } catch (error: unknown) {
      this.pipeline.session.emit('step:run', { step: this, meta: meta.error() });
      throw error;
    }
  }
}
