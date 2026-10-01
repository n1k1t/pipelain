import type { PipelineAiStep } from '../index';

import { buildTimeSpendMarker } from '../../../../../utils';
import { Meta } from '../../../../meta';

export abstract class PipelineAiAction {
  public timestamp: number = Date.now();
  public meta = Meta.build();

  protected marker = buildTimeSpendMarker(this.timestamp);

  constructor(public step: PipelineAiStep) {}

  /** Provides model metadata */
  public abstract provide(kind: 'initial' | 'final'): object | null;
  public abstract toPlain(): object;
}
