import type { TPipelineStepNestedHandler, TPipelineStepType } from './types';
import type { IPipelineConfiguration } from '../types';
import type { PipelineCompiler } from '../model';

import { IPipelineStepDefinition, IPipelineStepSource, PipelineStep, PipelineStepCompiler } from './model';
import { PipelineStepCompilationError } from './errors';
import { PipelineParameters } from '../parameters';
import { buildMetaManager } from '../../../utils';
import { chunkify } from '../../../utils';

interface IDefinition<TConfiguration extends IPipelineConfiguration> extends IPipelineStepDefinition {
  subtasks:
    | (PipelineStepCompiler | PipelineCompiler)[]
    | TPipelineStepNestedHandler<TConfiguration, (PipelineStepCompiler | PipelineCompiler)[]>;

  limit?: number;
}

export class PipelineSwarmStepCompiler<
  TConfiguration extends IPipelineConfiguration = any,
  TSchema extends PromiseSettledResult<any>[] = PromiseSettledResult<any>[]
> extends PipelineStepCompiler<TSchema> {
  private type: Extract<TPipelineStepType, 'swarm'> = 'swarm';

  constructor(protected definition: Partial<IDefinition<TConfiguration>>) {
    super();
  }

  /** Provides subtask executors */
  public subtasks<
    T extends PipelineStepCompiler | PipelineCompiler,
    TReturn extends PipelineSwarmStepCompiler<TConfiguration, PromiseSettledResult<T['TSchema']>[]>
  >(predicate: T[] | TPipelineStepNestedHandler<TConfiguration, T[]>): TReturn {
    this.definition.subtasks = predicate;
    return <this & TReturn>this;
  }

  /** Provides a bottle neck limit for parallel executions */
  public limit(value: number): this {
    this.definition.limit = value;
    return this;
  }

  public compile(provided: IPipelineStepSource): PipelineSwarmStep<TConfiguration, TSchema> {
    if (!this.definition.subtasks) {
      throw new PipelineStepCompilationError(this.type, '[subtasks] are empty');
    }

    return new PipelineSwarmStep(this.type, {
      title: this.definition.title,

      subtasks: this.definition.subtasks,
      limit: this.definition.limit,

      pipeline: provided.pipeline,
      parent: provided.parent,
    });
  }

  static build<TConfiguration extends IPipelineConfiguration, TSchema extends PromiseSettledResult<any>[]>(
    title?: string
  ): PipelineSwarmStepCompiler<TConfiguration, TSchema> {
    return new PipelineSwarmStepCompiler({ title });
  }
}

export class PipelineSwarmStep<
  TConfiguration extends IPipelineConfiguration = any,
  TSchema extends PromiseSettledResult<any>[] = PromiseSettledResult<any>[]
> extends PipelineStep<'swarm', TConfiguration, TSchema, IDefinition<TConfiguration>> {
  public async run(parameters: PipelineParameters<TConfiguration>): Promise<TSchema> {
    const meta = buildMetaManager();
    this.pipeline.session.emit('step:run', { step: this, meta: meta.init() });

    try {
      const subtasks = typeof this.definition.subtasks === 'function'
        ? await this.definition.subtasks(parameters)
        : this.definition.subtasks;

      const handled = await chunkify(subtasks, this.definition.limit ?? Infinity, async (subtask) => {
        const compiled = await subtask.compile({
          pipeline: this.pipeline,
          parent: this,
        });

        return compiled instanceof PipelineStep
          ? compiled.run(parameters)
          : compiled.run(undefined);
      });

      this.pipeline.session.emit('step:run', { step: this, meta: meta.done() });

      return <TSchema>handled.map((subtask) => subtask.result);
    } catch (error: unknown) {
      this.pipeline.session.emit('step:run', { step: this, meta: meta.error() });
      throw error;
    }
  }
}
