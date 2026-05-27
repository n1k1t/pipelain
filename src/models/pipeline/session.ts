import EventEmitter from 'events';

import type { PipelineStep } from './steps';
import type { Pipeline } from './model';

export interface IPipelineSessionEventMeta {
  state: 'INIT' | 'PENDING' | 'DONE' | 'ERROR';
  spent: number;
}

export interface IPipelineSessionEvents {
  'step:llm:tool': [{
    name: string;
    message: string;

    step: PipelineStep;
    meta: IPipelineSessionEventMeta;
  }];

  'step:llm:reasoning': [{
    message: string;

    step: PipelineStep;
    meta: IPipelineSessionEventMeta;
  }];

  'step:run': [{
    step: PipelineStep;
    meta: IPipelineSessionEventMeta;
  }];

  'run': [{
    pipeline: Pipeline;
    meta: IPipelineSessionEventMeta;
  }];

  'log': [{
    message: unknown[];
    pipeline: Pipeline;
  }];

  'warning': [{
    message: string;
  }];
}

export class PipelineSession extends EventEmitter<IPipelineSessionEvents> {
  public TEvents!: IPipelineSessionEvents;
  public id: string = Date.now().toString(32);

  public meta = {
    llm: {
      tokens: {
        input: 0,
        output: 0,
      },
    },
  };

  static build(): PipelineSession {
    return new PipelineSession();
  }
}
