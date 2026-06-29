import { ProviderMetadata } from 'ai';

import type { IPipelineSessionEventMeta } from '../../../session';
import type { PipelineAiStep } from '../index';

import { buildTimeSpendMarker } from '../../../../../utils';

export abstract class PipelineAiAction {
  public marker = buildTimeSpendMarker();
  public meta: IPipelineSessionEventMeta = {
    state: 'INIT',
    spent: 0,
  };

  constructor(public step: PipelineAiStep) {}

  /** Provides model metadata */
  public abstract provide(kind: 'initial' | 'final'): ProviderMetadata | null;

  public actualize(state: IPipelineSessionEventMeta['state']): this {
    this.meta.spent = this.marker();
    this.meta.state = state;

    return this;
  }
}
