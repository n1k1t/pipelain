import EventEmitter from 'events';

import type { PipelineStep } from './steps';
import type { LlmProvider } from '../llm';
import type { Pipeline } from './model';

export interface IPipelineSessionEventMeta {
  state: 'INIT' | 'PENDING' | 'DONE' | 'ERROR';
  spent: number;
}

export interface IPipelineSessionEvents {
  'step:llm:tool': [{
    step: PipelineStep;
    meta: IPipelineSessionEventMeta;

    name: string;
    message: string;

  }];

  'step:llm:reasoning': [{
    message: string;

    step: PipelineStep;
    meta: IPipelineSessionEventMeta;
  }];

  'step:llm:fallback': [{
    step: PipelineStep;

    providers: {
      old: LlmProvider;
      new: LlmProvider;
    };
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
    pipeline: Pipeline;
    message: unknown[];
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
