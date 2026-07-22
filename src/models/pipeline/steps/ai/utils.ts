import dayjs from 'dayjs';
import _ from 'lodash';

import { ModelMessage, Tool } from 'ai';
import { ZodType } from 'zod/v3';
import { zocker } from 'zocker';

import type { PipelineAiStep } from './index';
import { File } from '../../../file';

const renderDebugHeader = (title: string): string => [
  '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
  title.toUpperCase().padStart(40, ' '),
  '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
].join('\n');

export const compileDebug = async <TSchema>(step: PipelineAiStep, parameters: {
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
    `${dayjs(step.pipeline.session.timestamp).format('YYYY-MM-DD--HH-mm-ss')}--${step.pipeline.session.id}`,
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
