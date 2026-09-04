import type { IPipelineSessionEventMeta } from '../../../session';
import type { PipelineAiStep } from '../index';

import { buildTimeSpendMarker } from '../../../../../utils';

export abstract class PipelineAiAction {
  public timestamp: number = Date.now();
  public meta: IPipelineSessionEventMeta = {
    state: 'INIT',
    spent: 0,
  };

  protected marker = buildTimeSpendMarker(this.timestamp);

  constructor(public step: PipelineAiStep) {}

  /** Provides model metadata */
  public abstract provide(kind: 'initial' | 'final'): object | null;
  public abstract toPlain(): object;

  public actualize(state: IPipelineSessionEventMeta['state']): this {
    this.meta.spent = this.marker();
    this.meta.state = state;

    return this;
  }
}
