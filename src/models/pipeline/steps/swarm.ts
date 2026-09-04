import type { TPipelineStepNestedHandler, TPipelineStepType } from './types';
import type { IPipelineConfiguration } from '../types';
import type { PipelineCompiler } from '../model';

import { IPipelineStepDefinition, IPipelineStepSource, PipelineStep, PipelineStepCompiler } from './model';
import { PipelineStepCompilationError } from '../errors';
import { PipelineParameters } from '../parameters';
import { buildMetaManager } from '../../../utils';
import { chunkify } from '../../../utils';

interface IDefinition<TConfiguration extends IPipelineConfiguration> extends IPipelineStepDefinition {
  limit?: number;
  list?:
    | (PipelineStepCompiler | PipelineCompiler)[]
    | TPipelineStepNestedHandler<TConfiguration, (PipelineStepCompiler | PipelineCompiler)[]>;

  map?:
    | Record<string, PipelineStepCompiler | PipelineCompiler>
    | TPipelineStepNestedHandler<TConfiguration, Record<string, PipelineStepCompiler | PipelineCompiler>>;
}

export class PipelineSwarmStepCompiler<
  TConfiguration extends IPipelineConfiguration = any,
  TSchema extends PromiseSettledResult<any>[] | Record<string, PromiseSettledResult<any>>
    = PromiseSettledResult<any>[]
> extends PipelineStepCompiler<TSchema> {
  private type: Extract<TPipelineStepType, 'swarm'> = 'swarm';

  constructor(protected definition: Partial<IDefinition<TConfiguration>>) {
    super();
  }

  /** Provides a list of subtask executors */
  public list<
    T extends PipelineStepCompiler | PipelineCompiler,
    TReturn extends PipelineSwarmStepCompiler<TConfiguration, PromiseSettledResult<T['TSchema']>[]>
  >(predicate: T[] | TPipelineStepNestedHandler<TConfiguration, T[]>): TReturn {
    return this.subtasks(predicate);
  }

  /** Provides a collection of subtask executors keyed by name */
  public map<
    T extends Record<string, PipelineStepCompiler | PipelineCompiler>,
    TReturn extends PipelineSwarmStepCompiler<TConfiguration, {
      [K in keyof T]: PromiseSettledResult<T[K]['TSchema']>;
    }>
  >(predicate: T | TPipelineStepNestedHandler<TConfiguration, T>): TReturn {
    this.definition.map = predicate;
    return <this & TReturn>this;
  }

  /** Provides a bottle neck limit for parallel executions */
  public limit(value: number): this {
    this.definition.limit = value;
    return this;
  }

  public compile(provided: IPipelineStepSource): PipelineSwarmStep<TConfiguration, TSchema> {
    if (!this.definition.list && !this.definition.map) {
      throw new PipelineStepCompilationError(this.type, '[subtasks] are empty');
    }
    if (this.definition.list && this.definition.map) {
      throw new PipelineStepCompilationError(this.type, '[map] and [list] are conflicted');
    }

    return new PipelineSwarmStep(this.type, {
      title: this.definition.title,
      limit: this.definition.limit,

      list: this.definition.list,
      map: this.definition.map,

      pipeline: provided.pipeline,
      parent: provided.parent,
    });
  }

  /** @deprecated Provides subtask executors (use `list` method instead) */
  public subtasks<
    T extends PipelineStepCompiler | PipelineCompiler,
    TReturn extends PipelineSwarmStepCompiler<TConfiguration, PromiseSettledResult<T['TSchema']>[]>
  >(predicate: T[] | TPipelineStepNestedHandler<TConfiguration, T[]>): TReturn {
    this.definition.list = predicate;
    return <this & TReturn>this;
  }

  static build<
    TConfiguration extends IPipelineConfiguration,
    TSchema extends PromiseSettledResult<any>[] | Record<string, PromiseSettledResult<any>>
  >(title?: string): PipelineSwarmStepCompiler<TConfiguration, TSchema> {
    return new PipelineSwarmStepCompiler({ title });
  }
}

export class PipelineSwarmStep<
  TConfiguration extends IPipelineConfiguration = any,
  TSchema extends PromiseSettledResult<any>[] | Record<string, PromiseSettledResult<any>> = PromiseSettledResult<any>[]
> extends PipelineStep<'swarm', TConfiguration, TSchema, IDefinition<TConfiguration>> {
  public async run(parameters: PipelineParameters<TConfiguration>): Promise<TSchema> {
    const meta = buildMetaManager();
    const exec = async (subtask: PipelineStepCompiler | PipelineCompiler) => {
      const compiled = await subtask.compile({ pipeline: this.pipeline, parent: this });

      return compiled instanceof PipelineStep
        ? compiled.run(parameters)
        : compiled.run(undefined);
    };

    this.pipeline.session.emit('step:run', { step: this, meta: meta.init() });

    try {
      if (this.definition.map) {
        const map = typeof this.definition.map === 'function'
          ? await this.definition.map(parameters)
          : this.definition.map;

        const handled = await chunkify(Object.keys(map), this.definition.limit ?? Infinity, (key) => exec(map[key]));
        const result = <TSchema>Object.fromEntries(handled.map((subtask) => [subtask.payload, subtask.result]));

        this.pipeline.session.emit('step:run', { step: this, meta: meta.done() });
        return result;
      }

      const subtasks = typeof this.definition.list === 'function'
        ? await this.definition.list(parameters)
        : this.definition.list ?? [];

      const handled = await chunkify(subtasks, this.definition.limit ?? Infinity, exec);
      const result = <TSchema>handled.map((subtask) => subtask.result);

      this.pipeline.session.emit('step:run', { step: this, meta: meta.done() });
      return result;
    } catch (error: unknown) {
      this.pipeline.session.emit('step:run', { step: this, meta: meta.error() });
      throw error;
    }
  }
}
