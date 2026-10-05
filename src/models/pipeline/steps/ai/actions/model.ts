import type { PipelineAiStep } from '../index';

import { Meta } from '../../../../meta';

export abstract class PipelineAiAction {
  public meta = Meta.build();

  constructor(public step: PipelineAiStep) {}

  /** Provides model metadata */
  public abstract provide(kind: 'initial' | 'final'): object | null;
  public abstract toPlain(): object;
}
