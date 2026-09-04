import { LanguageModelUsage } from 'ai';
import EventEmitter from 'events';

import type { LlmProvider } from '../llm';
import type { Pipeline } from './model';
import type {
  PipelineAiError,
  PipelineAiFallbackAction,
  PipelineAiReasoningAction,
  PipelineAiToolAction,
  PipelineStep,
  TPipelineAiStepAction,
} from './steps';

import { buildCounter, cast } from '../../utils';

export interface IPipelineSessionEventMeta {
  state: 'INIT' | 'PENDING' | 'DONE' | 'ERROR';
  spent: number;
}

export interface IPipelineSessionEvents {
  'step:ai:reasoning': [PipelineAiReasoningAction];
  'step:ai:fallback': [PipelineAiFallbackAction];
  'step:ai:tool': [PipelineAiToolAction];

  'step:ai:complete': [{
    step: PipelineStep;
    llm: LlmProvider;

    actions: TPipelineAiStepAction[];
    output: unknown;
    usage: LanguageModelUsage;

    messages: {
      system: string;
      user: string;
    };
  }];

  'step:ai:error': [{
    step: PipelineStep;
    llm: LlmProvider;

    actions: TPipelineAiStepAction[];
    error: PipelineAiError;

    messages: {
      system: string;
      user: string;
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
    message: string[];
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

    usage: {
      llm: cast<Record<string, { prompt: number; completion: number }>>({}),
    },
  };

  static build(): PipelineSession {
    const session = new PipelineSession();

    session.on('step:run', ({ meta }) => {
      if (meta.state === 'INIT') {
        session.meta.counters.steps();
      }
    });

    session.on('step:ai:complete', ({ usage, llm }) => {
      const key = [llm.name, llm.model].join('/');
      const section = session.meta.usage.llm[key] ?? {
        prompt: 0,
        completion: 0,
      };

      if (usage.inputTokens) {
        section.prompt += usage.inputTokens;
      }
      if (usage.outputTokens) {
        section.completion += usage.outputTokens;
      }

      session.meta.usage.llm[key] = section;
    });

    return session;
  }
}
