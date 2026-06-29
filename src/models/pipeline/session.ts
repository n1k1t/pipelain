import EventEmitter from 'events';

import type { PipelineAiError, PipelineAiReasoningAction, PipelineAiToolAction, PipelineStep } from './steps';
import type { LlmProvider } from '../llm';
import type { Pipeline } from './model';

import { buildCounter } from '../../utils';

export interface IPipelineSessionEventMeta {
  state: 'INIT' | 'PENDING' | 'DONE' | 'ERROR';
  spent: number;
}

export interface IPipelineSessionEvents {
  'step:ai:reasoning': [PipelineAiReasoningAction];
  'step:ai:tool': [PipelineAiToolAction];

  'step:ai:fallback': [{
    step: PipelineStep;
    reason: PipelineAiError;

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

  public timestamp: number = Date.now();
  public id: string = this.timestamp.toString(32);

  public meta = {
    counters: {
      steps: buildCounter(),
    },

    llm: {
      tokens: {
        input: 0,
        output: 0,
      },
    },
  };

  static build(): PipelineSession {
    const session = new PipelineSession();

    session.on('step:run', ({ meta }) => {
      if (meta.state === 'INIT') {
        session.meta.counters.steps();
      }
    });

    return session;
  }
}
