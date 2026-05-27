import path from 'path';
import fs from 'fs/promises';

import { z } from 'zod/v3';

import { LlmToolCompiler, LlmToolExecutionError } from './model';
import { checkPatternIsRestricted } from './utils';
import { ArticleContent } from '../../content';

export default LlmToolCompiler
  .build(
    ArticleContent
      .build({
        title: 'List files and directories in a specified location',

        content: [
          { p: `**Usage:**` },
          {
            ul: [
              'You should generally prefer the Glob and Grep tools, if you know which directories to search',
            ],
          },
        ],
      })
      .render()
  )
  .input(
    z.object({
      path: z.string().describe('The path to the directory to list'),
    })
  )
  .output(z.string().describe('List of entries in the directory separated by newline'))
  .execute(({ context }) => async ({ path: location }) => {
    try {
      if (!checkPatternIsRestricted(location)) {
        throw LlmToolExecutionError.build('ls', `Path "${location}" is going to out of scope the project`);
      }

      if (location.startsWith('__vfs__/')) {
        throw LlmToolExecutionError.build(
          'ls',
          'Cannot ls virtual file. Only `read` tool is allowed to work with this file'
        );
      }

      const entries = await fs.readdir(path.join(context.project.cwd, location), { withFileTypes: true });
      return entries.map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`).join('\n');
    } catch (error: unknown) {
      throw LlmToolExecutionError.build('ls', error);
    }
  });
