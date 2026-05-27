import { z } from 'zod/v3';

import { LlmToolCompiler } from './model';
import { ArticleContent } from '../../content';

export default LlmToolCompiler
  .build(
    ArticleContent
      .build({
        title: 'Find files by glob patterns',

        content: [
          { p: `**Features:**` },
          {
            ul: [
              'Supports standard glob patterns (e.g., `**/*.ts`, `src/*.js`)',
              'Returns a newline-separated list of matching file paths',
              'Fast file discovery across the entire project',
            ],
          },

          { p: `**Usage:**` },
          {
            ul: [
              'Use this to locate files when you know the naming pattern but not the exact path',
              'Combine with `grep` to process the discovered files',
            ],
          },
        ],
      })
      .render()
  )
  .input(
    z.object({
      pattern: z.string().describe('The glob pattern to match files against'),
    })
  )
  .output(
    z.string().describe('The paths to the matching files separated by newline')
  )
  .execute(({ context }) => async ({ pattern }) => {
    return context.project.files.glob([pattern]).join('\n');
  });
