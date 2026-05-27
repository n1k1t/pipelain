import type { IPipelineConfiguration } from '../types';
import type { PipelineParameters } from '../parameters';
import type { TFunction } from '../../../../types';

export type TPipelineStepType = 'self' | 'ai' | 'swarm' | 'loop';

export type TPipelineStepNestedHandler<
  TConfiguration extends IPipelineConfiguration = any,
  TReturn = any
> = TFunction<TReturn | Promise<TReturn>, [Omit<PipelineParameters<TConfiguration>, 'factory'>]>;
