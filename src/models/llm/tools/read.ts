import { z } from 'zod/v3';

import { LlmToolCompiler, LlmToolExecutionError } from './model';
import { checkPatternIsRestricted } from './utils';
import { ArticleContent } from '../../content';
import { File } from '../../file';

export default LlmToolCompiler
  .build(
    ArticleContent
      .build({
        title: 'Read files contents',

        content: [
          { p: `**Features:**` },
          {
            ul: [
              'Parameter `path` should be relative to the project',
              'Options `start` and `end` are helpful to cut file content (not acceptable for virtual files)',
            ],
          },

          { p: `**Usage:**` },
          {
            ul: [
              'Use the `grep` tool before this to catch a required context',
              'Use this tool only when there are no any ways to get a context of files',
            ],
          },
        ],
      })
      .render()
  )
  .input(
    z.object({
      path: z.string().describe('The path to the file to read'),

      start: z.number().optional().describe('The line number to start reading from (1-indexed)'),
      end: z.number().optional().describe('The line number to end reading at (inclusive)'),
    })
  )
  .output(z.string().describe('File content'))
  .execute(({ vfs, context }) => async ({ path, start, end }) => {
    try {
      const virtual = vfs.get(path);
      if (virtual) {
        return virtual.content;
      }

      if (!checkPatternIsRestricted(path)) {
        throw LlmToolExecutionError.build('read', `Path "${path}" is going to out of scope the project`);
      }

      const file = await File.build(path, {
        cwd: context.project.cwd,
        state: 'existent',
        strict: true,
      });

      if (start === undefined && end === undefined) {
        return file.content;
      }

      const lines = file.content.split('\n');
      const sliced = lines.slice(start ? start - 1 : 0, end ? end : lines.length);
      const content = sliced.join('\n');

      if (content.length > 50000) {
        throw LlmToolExecutionError.build('read', [
          'The file content is too large (over 50000 chars).',
          'Please use a smaller range with "start" and "end" parameters, or use the "grep" tool to find the relevant context',
        ]);
      }

      return content;
    } catch (error: unknown) {
      throw LlmToolExecutionError.build('read', error);
    }
  });
