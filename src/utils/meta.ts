import type { IPipelineSessionEventMeta } from '../models';
import { buildTimeSpendMarker } from './common';

export interface IMetaManager {
  init: () => IPipelineSessionEventMeta;
  done: () => IPipelineSessionEventMeta;
  error: () => IPipelineSessionEventMeta;
  pending: () => IPipelineSessionEventMeta;
}

export const buildMetaManager = (): IMetaManager => {
  const marker = buildTimeSpendMarker();

  return {
    init: (): IPipelineSessionEventMeta => ({ state: 'INIT', spent: 0 }),
    done: (): IPipelineSessionEventMeta => ({ state: 'DONE', spent: marker() }),
    error: (): IPipelineSessionEventMeta => ({ state: 'ERROR', spent: marker() }),
    pending: (): IPipelineSessionEventMeta => ({ state: 'PENDING', spent: marker() }),
  };
}
