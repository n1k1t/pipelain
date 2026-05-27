import type { IPipelineConfiguration } from '../types';
import type { PipelineParameters } from '../parameters';
import type { TPipelineStepType } from './types';
import type { Pipeline } from '../model';

import { buildCounter, cast } from '../../../utils';

export interface IPipelineStepSource {
  pipeline: Pipeline;
  parent: Pipeline | PipelineStep;
}

export interface IPipelineStepDefinition extends IPipelineStepSource {
  title?: string;
}

const counter = buildCounter();

export abstract class PipelineStepCompiler<TSchema = any> {
  public TSchema!: TSchema;

  public abstract compile(provided: IPipelineStepSource): PipelineStep
}

export abstract class PipelineStep<
  K extends TPipelineStepType = TPipelineStepType,
  TConfiguration extends IPipelineConfiguration = any,
  TSchema = any,
  TDefinition extends IPipelineStepDefinition = IPipelineStepDefinition
> {
  public TSchema!: TSchema;

  public title: string = this.definition.title ?? `Step ${counter()}`;

  public pipeline: TDefinition['pipeline'] = this.definition.pipeline;
  public parent: TDefinition['parent'] = this.definition.parent;

  constructor(public type: K, protected definition: TDefinition) {}

  public abstract run(parameters: PipelineParameters<TConfiguration>): Promise<TSchema>;

  /** Traces instances from this to origin */
  public trace(): (Pipeline | PipelineStep)[] {
    return this.parent
      ? cast<(Pipeline | PipelineStep)[]>([this]).concat(this.parent.trace())
      : [this];
  }
}
