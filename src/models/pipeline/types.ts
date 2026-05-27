import type { PipelineParameters } from './parameters';
import type { TFunction } from '../../../types';
import type { Content } from '../content';

export type TPipelineCompilerConfigurationStepType = 'named' | 'anonymous';
export type TPipelineContentPredicate = (string | Content)[];

export interface IPipelineConfiguration {
  input: unknown;
  state: {};
}

export type TPipelineStepGeneralHandler<
  TConfiguration extends IPipelineConfiguration = any,
  TReturn = any
> = TFunction<TReturn | Promise<TReturn>, [PipelineParameters<TConfiguration>]>;

export type TPipelineCompilerConfigurationStep<
  K extends TPipelineCompilerConfigurationStepType = TPipelineCompilerConfigurationStepType,
  TConfiguration extends IPipelineConfiguration = any
> = {
  named: {
    type: 'named';

    name: string;
    handler: TPipelineStepGeneralHandler<TConfiguration>;
  };

  anonymous: {
    type: 'anonymous'
    handler: TPipelineStepGeneralHandler<TConfiguration>;
  };
}[K];
