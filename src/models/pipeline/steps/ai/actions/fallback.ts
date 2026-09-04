import type { PipelineAiError, PipelineAiStep } from '../index';
import type { LlmProvider } from '../../../../llm';

import { PipelineAiAction } from './model';

interface IFallbackLlm {
  old: LlmProvider;
  new: LlmProvider;
}

export class PipelineAiFallbackAction extends PipelineAiAction {
  public TPlain!: {
    type: 'ai:fallback';
    error: PipelineAiError;

    llm: Record<'old' | 'new', {
      name: string;
      model: string;

      parameters: Pick<LlmProvider, 'reasoning' | 'temperature'>;
      options?: object;
    }>;
  };

  public output: string = '';
  public delta: string = '';

  constructor(
    public step: PipelineAiStep,
    public llm: IFallbackLlm,
    public error: PipelineAiError,
  ) {
    super(step);
  }

  public provide(): null {
    return null;
  }

  public toPlain(): PipelineAiFallbackAction['TPlain'] {
    return {
      type: 'ai:fallback',
      error: this.error,

      llm: {
        old: {
          name: this.llm.old.name,
          model: this.llm.old.model,

          options: this.llm.old.options,
          parameters: {
            temperature: this.llm.old.temperature,
            reasoning: this.llm.old.reasoning,
          },
        },

        new: {
          name: this.llm.new.name,
          model: this.llm.new.model,

          options: this.llm.new.options,
          parameters: {
            temperature: this.llm.new.temperature,
            reasoning: this.llm.new.reasoning,
          },
        },
      },
    };
  }

  static build(
    step: PipelineAiStep,
    error: PipelineAiError,
    llm: PipelineAiFallbackAction['llm']
  ): PipelineAiFallbackAction {
    return new PipelineAiFallbackAction(step, llm, error).actualize('DONE');
  }
}
