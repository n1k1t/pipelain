import type { LanguageModelUsage } from 'ai';

import type { PipelineAiError, TPipelineAiStepAction } from '../steps';
import type { TPipelineLogLevel } from '../types';
import type { PipelineSession } from '../session';
import type { LlmProvider } from '../../llm';
import type { Meta } from '../../meta';

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
    type: 'step:error';

    meta: Meta['TPlain'];
    step: TPipelineReportSnapshotStep;
    llm: TPipelineReportSnapshotLlm;

    messages: TPipelineReportSnapshotMessages;
    actions: TPipelineAiStepAction['TPlain'][];
    error: PipelineAiError;
  }
  | {
    type: 'step:done';

    meta: Meta['TPlain'];
    step: TPipelineReportSnapshotStep;
    llm: TPipelineReportSnapshotLlm;

    messages: TPipelineReportSnapshotMessages;
    actions: TPipelineAiStepAction['TPlain'][];
    output: unknown;
    usage: LanguageModelUsage;
  }
  | {
    type: 'log';
    level: TPipelineLogLevel;

    timestamp: number;
    message: string;
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
    spent: number;
    id: string;
  };

  assets: {
    main: {
      script: string;
      style: string;
    };
  };
}
