import type { LanguageModelUsage } from 'ai';

import type { PipelineAiError, TPipelineAiStepAction } from '../steps';
import type { PipelineSession } from '../session';
import type { LlmProvider } from '../../llm';

interface TPipelineReportSnapshotStep {
  title: string;
}

export interface TPipelineReportSnapshotLlm {
  name: string;
  model: string;

  parameters: Pick<LlmProvider, 'limit' | 'reasoning' | 'temperature'>;
}

export interface TPipelineReportSnapshotMessages {
  system: string;
  user: string;
}

export type TPipelineReportSnapshot =
  | {
    state: 'ERROR';
    timestamp: number;

    step: TPipelineReportSnapshotStep;
    llm: TPipelineReportSnapshotLlm;

    messages: TPipelineReportSnapshotMessages;
    actions: TPipelineAiStepAction['TPlain'][];
    error: PipelineAiError;
  }
  | {
    state: 'DONE';
    timestamp: number;

    step: TPipelineReportSnapshotStep;
    llm: TPipelineReportSnapshotLlm;

    messages: TPipelineReportSnapshotMessages;
    actions: TPipelineAiStepAction['TPlain'][];
    output: unknown;
    usage: LanguageModelUsage;
  };

export interface IPipelineReportTemplateData {
  snapshots: TPipelineReportSnapshot[];

  usage: {
    llm: {
      total: PipelineSession['meta']['usage']['llm'][string];
      separated: PipelineSession['meta']['usage']['llm'];
    };
  };

  session: {
    timestamp: number;
    id: string;
  };

  assets: {
    main: {
      script: string;
      style: string;
    };
  };
}
