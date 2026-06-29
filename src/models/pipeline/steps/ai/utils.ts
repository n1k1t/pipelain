import _ from 'lodash';

import { ModelMessage, ProviderMetadata, StreamTextResult, Tool } from 'ai';
import { ZodType } from 'zod/v3';
import { zocker } from 'zocker';

import type { PipelineAiReasoningAction, PipelineAiStep, PipelineAiToolAction } from './index';
import { File } from '../../../file';

const renderDebugHeader = (title: string): string => [
  '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
  title.toUpperCase().padStart(40, ' '),
  '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
].join('\n');

export const useStepDebug = async <TSchema>(step: PipelineAiStep, parameters: {
  messages: ModelMessage[];

  schema?: ZodType<TSchema>;
  tools?: Record<string, Tool>;
}): Promise<TSchema> => {
  const location = `${new Date(step.pipeline.session.timestamp).toLocaleTimeString()}-${step.pipeline.session.id}`;
  const title = step.trace().reverse().map((entity) => _.kebabCase(entity.title)).join('.');

  const file = await File.build([
    '.pipeline',
    location,
    `${step.pipeline.session.meta.counters.steps(0)}.${title}.md`,
  ]);

  file.append([
    `${renderDebugHeader('tools')}\n`,

    ...Object
      .entries(parameters.tools ?? {})
      .map(([name, tool]) => `# \`${name}\`\n\n${tool.description}\n\n---\n`)
  ].join('\n'))

  parameters.messages.forEach((message) =>
    file.append([`\n${renderDebugHeader(message.role)}\n`, message.content].join('\n'))
  );

  await file.write(file.content.trim());
  return parameters.schema ? zocker(parameters.schema).generate() : <TSchema>'DEBUG AI OUTPUT';
}
