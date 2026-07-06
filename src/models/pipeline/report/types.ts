import type { LanguageModelUsage } from 'ai';

import type { PipelineAiError, PipelineAiReasoningAction, PipelineAiToolAction } from '../steps';
import type { PipelineSession } from '../session';

interface TPipelineReportSnapshotStep {
  title: string;
}

export interface TPipelineReportSnapshotLlm {
  name: string;
  model: string;
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
    actions: (PipelineAiToolAction['TPlain'] | PipelineAiReasoningAction['TPlain'])[];
    error: PipelineAiError;
  }
  | {
    state: 'DONE';
    timestamp: number;

    step: TPipelineReportSnapshotStep;
    llm: TPipelineReportSnapshotLlm;

    messages: TPipelineReportSnapshotMessages;
    output: unknown;

    actions: (PipelineAiToolAction['TPlain'] | PipelineAiReasoningAction['TPlain'])[];
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
