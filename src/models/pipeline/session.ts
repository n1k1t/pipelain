import { LanguageModelUsage } from 'ai';
import EventEmitter from 'events';

import type { TPipelineLogLevel } from './types';
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

import { buildCounter, cast, extractLlmUsageTokens } from '../../utils';

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

  'step:run': [{ step: PipelineStep }];
  'run': [{ pipeline: Pipeline }];

  'log': [{
    level: TPipelineLogLevel;

    pipeline: Pipeline;
    message: unknown[];
  }];
}

export class PipelineSession extends EventEmitter<IPipelineSessionEvents> {
  public TEvents!: IPipelineSessionEvents;

  public meta = {
    timestamp: Date.now(),
    spent: 0,

    counters: {
      steps: buildCounter(),
    },

    usage: {
      llm: cast<Record<string, { prompt: number; cached: number; completion: number }>>({}),
    },
  };

  public id: string = this.meta.timestamp.toString(32);

  static build(): PipelineSession {
    const session = new PipelineSession();

    session.on('step:run', ({ step }) => {
      if (step.meta.is('INIT')) {
        session.meta.counters.steps();
      }
    });

    session.on('run', ({ pipeline }) => {
      if (!pipeline.parent && pipeline.meta.is(['DONE', 'ERROR'])) {
        session.meta.spent += pipeline.meta.spent;
      }
    });

    session.on('step:ai:complete', ({ usage, llm }) => {
      const key = [llm.name, llm.model].join('/');
      const section = session.meta.usage.llm[key] ?? {
        prompt: 0,
        cached: 0,
        completion: 0,
      };

      const tokens = extractLlmUsageTokens(usage);

      section.prompt += tokens.prompt;
      section.cached += tokens.cached;

      section.completion += tokens.completion;
      session.meta.usage.llm[key] = section;
    });

    return session;
  }
}
