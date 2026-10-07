import dayjs from 'dayjs';
import _ from 'lodash';

import { ModelMessage, ProviderMetadata, Tool } from 'ai';
import { ZodType } from 'zod/v3';
import { zocker } from 'zocker';

import type { TPipelineAiModelAction } from './types';
import type { PipelineAiStep } from './index';
import { PipelineAiReasoningAction, PipelineAiToolAction } from './actions';
import { File } from '../../../file';

const renderDebugHeader = (title: string): string => [
  '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
  title.toUpperCase().padStart(40, ' '),
  '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
].join('\n');

/** Compiles conversation messages from user prompt and history of previous attempts */
export const compileMessages = (provided: {
  user: string;

  history?: {
    actions: TPipelineAiModelAction[];
    trace?: ProviderMetadata;
  }[];
}): ModelMessage[] => {
  const messages: ModelMessage[] = [{
    role: 'user',
    content: provided.user,
  }];

  provided.history?.forEach((record) => {
    if (record.actions.every((action) => action instanceof PipelineAiReasoningAction)) {
      return messages.push({
        role: 'assistant',
        providerOptions: record.trace,

        content: record.actions.map((action: PipelineAiReasoningAction) => action.format()),
      });
    }

    messages.push(
      {
        role: 'assistant',
        providerOptions: record.trace,

        content: record.actions.map((action) =>
          action instanceof PipelineAiReasoningAction
            ? action.format()
            : action.format('call-part')
        ),
      },
      {
        role: 'tool',
        providerOptions: record.trace,

        content: record.actions
          .filter((action) => action instanceof PipelineAiToolAction)
          .map((action) => action.format('result-part')),
      },
    );
  });

  // Some providers (e.g. Gemini) reject requests ending with a model turn
  if (_.last(messages)?.role === 'assistant') {
    messages.push({
      role: 'user',
      content: 'Previous attempt produced no output. Continue and provide the final answer.',
    });
  }

  return messages;
}

export const compileDebug =async <TSchema>(step: PipelineAiStep, parameters: {
  messages: {
    system: string;
    user: string;
  };

  schema?: ZodType<TSchema>;
  tools?: Record<string, Tool>;
}): Promise<TSchema> => {
  const title = step.trace().reverse().map((entity) => _.kebabCase(entity.title)).join('.');
  const file = await File.build([
    '.pipelain',
    'debug',
    `${dayjs(step.pipeline.session.meta.timestamp).format('YYYY-MM-DD--HH-mm-ss')}--${step.pipeline.session.id}`,
    `${step.pipeline.session.meta.counters.steps(0)}.${title}.md`,
  ]);

  file.append([
    `${renderDebugHeader('tools')}\n`,

    ...Object
      .entries(parameters.tools ?? {})
      .map(([name, tool]) => `# \`${name}\`\n\n${tool.description}\n\n---\n`)
  ].join('\n'))

  Object.entries(parameters.messages).forEach(([role, content]) =>
    file.append([`\n${renderDebugHeader(role)}\n`, content].join('\n'))
  );

  await file.write(file.content.trim());
  return parameters.schema ? zocker(parameters.schema).generate() : <TSchema>'DEBUG AI OUTPUT';
}
