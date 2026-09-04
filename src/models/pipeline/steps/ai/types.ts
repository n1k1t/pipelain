import type { ZodType } from 'zod/v3';

import type { IPipelineConfiguration, TPipelineContentPredicate } from '../../types';
import type { TPipelineStepNestedHandler } from '../types';
import type { IPipelineStepDefinition } from '../model';
import type { LlmProvider } from '../../../llm';

import type * as actions from './actions';

export type TPipelineAiModelAction =
  | actions.PipelineAiToolAction
  | actions.PipelineAiReasoningAction;

export type TPipelineAiStepAction =
  | actions.PipelineAiToolAction
  | actions.PipelineAiFallbackAction
  | actions.PipelineAiReasoningAction;

export interface IDefinition<TConfiguration extends IPipelineConfiguration> extends IPipelineStepDefinition {
  prompt: TPipelineContentPredicate | TPipelineStepNestedHandler<TConfiguration, TPipelineContentPredicate>;

  schema?: ZodType | TPipelineStepNestedHandler<TConfiguration, ZodType>;
  llm?: LlmProvider | TPipelineStepNestedHandler<TConfiguration, LlmProvider>;

  debug?: boolean;
}
