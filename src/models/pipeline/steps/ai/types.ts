import type { ZodType } from 'zod/v3';

import type { IPipelineConfiguration, TPipelineContentPredicate } from '../../types';
import type { TPipelineStepNestedHandler } from '../types';
import type { IPipelineStepDefinition } from '../model';
import type { LlmProvider } from '../../../llm';

export interface IDefinition<TConfiguration extends IPipelineConfiguration> extends IPipelineStepDefinition {
  prompt: TPipelineContentPredicate | TPipelineStepNestedHandler<TConfiguration, TPipelineContentPredicate>;

  schema?: ZodType | TPipelineStepNestedHandler<TConfiguration, ZodType>;
  llm?: LlmProvider | TPipelineStepNestedHandler<TConfiguration, LlmProvider>;

  debug?: boolean;
}
