import type { IPipelineConfiguration, TPipelineContentPredicate } from '../types';
import type { TPipelineStepType } from './types';
import type { PipelineCompiler } from '../model';
import type { TFunction } from '../../../../types';

import { IPipelineStepDefinition, IPipelineStepSource, PipelineStep, PipelineStepCompiler } from './model';
import { PipelineStepCompilationError } from './errors';
import { buildMetaManager } from '../../../utils';
import { PipelineParameters } from '../parameters';

export type TPipelineLoopStepVerdictStatus = 'initial' | 'fulfilled' | 'pending' | 'rejected' | 'voided';

export type TPipelineLoopStepSchema<
  K extends TPipelineLoopStepVerdictStatus = TPipelineLoopStepVerdictStatus,
  TValue = any
> = {
  initial: {
    status: 'initial';
    value: null;
  };

  fulfilled: {
    status: 'fulfilled';
    value: TValue;
  };

  pending: {
    status: 'pending';
    value: TValue;
  };

  rejected: {
    status: 'rejected';
    reason: Error;
  };

  voided: {
    status: 'voided';
    value: null;
  };
}[K];

export type TPipelineLoopStepConditionVerdict =
  | Pick<TPipelineLoopStepSchema<'fulfilled' | 'voided'>, 'status'>
  | Pick<TPipelineLoopStepSchema<'pending'>, 'status'> & {
    content?: TPipelineContentPredicate;
  };

export type TPipelineLoopStepActionVerdict = Pick<TPipelineLoopStepSchema<'initial' | 'pending'>, 'status'> & {
  content?: TPipelineContentPredicate;
};

export type TPipelineLoopStepConditionHandler<
  TConfiguration extends IPipelineConfiguration = any,
  TResult = any
> = TFunction<TPipelineLoopStepConditionVerdict | Promise<TPipelineLoopStepConditionVerdict>, [
  Omit<PipelineParameters<TConfiguration>, 'factory'> & {
    result: TResult;
  }
]>;

export type TPipelineLoopStepActionHandler<
  TConfiguration extends IPipelineConfiguration = any,
  TCompiler extends PipelineStepCompiler | PipelineCompiler = PipelineStepCompiler | PipelineCompiler
> = TFunction<TCompiler | Promise<TCompiler>, [
  PipelineParameters<TConfiguration> & {
    verdict: TPipelineLoopStepActionVerdict;
    iteration: number;
  }
]>;

interface IDefinition<
  TConfiguration extends IPipelineConfiguration,
  TValue = any
> extends IPipelineStepDefinition {
  condition: TPipelineLoopStepConditionHandler<TConfiguration, TValue>;
  action: TPipelineLoopStepActionHandler<TConfiguration>;

  limit?: number;
}

export class PipelineLoopStepCompiler<
  TConfiguration extends IPipelineConfiguration = any,
  TValue = any,
  TSchema extends TPipelineLoopStepSchema<TPipelineLoopStepVerdictStatus, TValue> = TPipelineLoopStepSchema<
    TPipelineLoopStepVerdictStatus,
    TValue
  >
> extends PipelineStepCompiler<TSchema> {
  private type: Extract<TPipelineStepType, 'loop'> = 'loop';

  constructor(protected definition: Partial<IDefinition<TConfiguration>>) {
    super();
  }

  /** Provides limit for a loop */
  public limit(value: number): this {
    this.definition.limit = value;
    return this;
  }

  /** Provides condition executor that signals when loop should be stopped */
  public condition(handler: TPipelineLoopStepConditionHandler<TConfiguration, TValue>): this {
    this.definition.condition = handler;
    return this;
  }

  /** Provides action steps or pipelines to execute in a loop */
  public action<
    T extends PipelineStepCompiler | PipelineCompiler,
    TReturn extends PipelineLoopStepCompiler<
      TConfiguration,
      T['TSchema'],
      TPipelineLoopStepSchema<TPipelineLoopStepVerdictStatus, T['TSchema']>
    >
  >(handler: TPipelineLoopStepActionHandler<TConfiguration, T>): TReturn {
    this.definition.action = handler;
    return <this & TReturn>this;
  }

  public compile(provided: IPipelineStepSource): PipelineLoopStep<TConfiguration, TSchema> {
    if (!this.definition.condition) {
      throw new PipelineStepCompilationError(this.type, '[condition] is missing');
    }
    if (!this.definition.action) {
      throw new PipelineStepCompilationError(this.type, '[action] is missing');
    }

    return new PipelineLoopStep(this.type, {
      title: this.definition.title,

      condition: this.definition.condition,
      action: this.definition.action,

      pipeline: provided.pipeline,
      parent: provided.parent,
    });
  }

  static build<TConfiguration extends IPipelineConfiguration, TSchema extends TPipelineLoopStepSchema>(
    title?: string
  ): PipelineLoopStepCompiler<TConfiguration, TSchema> {
    return new PipelineLoopStepCompiler({ title });
  }
}

export class PipelineLoopStep<
  TConfiguration extends IPipelineConfiguration = any,
  TSchema extends TPipelineLoopStepSchema = TPipelineLoopStepSchema
> extends PipelineStep<'loop', TConfiguration, TSchema, IDefinition<TConfiguration>> {
  public async run(parameters: PipelineParameters<TConfiguration>): Promise<TSchema> {
    const meta = buildMetaManager();
    this.pipeline.session.emit('step:run', { step: this, meta: meta.init() });

    try {
      const limit = this.definition.limit ?? 5;
      const verdict: TPipelineLoopStepActionVerdict = {
        status: 'initial',
      };

      for (let i = 0; i < limit; i++) {
        const action = await this.definition.action(parameters.extend({ verdict, iteration: i }));
        const compiled = await action.compile({
          pipeline: this.pipeline,
          parent: this,
        });

        const result = compiled instanceof PipelineStep
          ? await compiled.run(parameters)
          : await compiled.run(undefined);

        const [checked] = await Promise.allSettled([
          this.definition.condition(parameters.extend({ result }))
        ]);

        if (checked.status === 'rejected') {
          this.pipeline.session.emit('step:run', { step: this, meta: meta.error() });
          return <TSchema>checked;
        }
        if (checked.value.status === 'pending') {
          verdict.status = 'pending';
          verdict.content = checked.value.content;

          continue;
        }

        this.pipeline.session.emit('step:run', { step: this, meta: meta.done() });

        return <TSchema>{
          status: checked.value.status,
          value: result,
        };
      }

      this.pipeline.session.emit('step:run', { step: this, meta: meta.done() });

      return <TPipelineLoopStepSchema & TSchema>{
        status: 'voided',
      };
    } catch (error: unknown) {
      this.pipeline.session.emit('step:run', { step: this, meta: meta.error() });
      throw error;
    }
  }
}
