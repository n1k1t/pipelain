import { z } from 'zod/v3';
import _ from 'lodash';

import { LlmToolCompiler, LlmToolExecutionError } from './model';
import { checkPatternIsRestricted } from './utils';
import { ArticleContent } from '../../content';
import { Rg } from '../../rg';

export default LlmToolCompiler
  .build(
    ArticleContent
      .build({
        title: 'Fast content search tool that works with any codebase size',

        content: [
          { p: `**Features:**` },
          {
            ul: [
              'Searches file contents using regular expressions',
              'Supports full regex syntax (eg. "log.*Error", "function\\s+\\w+", etc.)',
              'Filter files by pattern with the include parameter (eg. "*.js", "*.{ts,tsx}")',
              'Returns file paths and line numbers with at least one match sorted by modification time',
            ],
          },

          { p: `**Usage:**` },
          {
            ul: [
              'Use this tool when you need to find files containing specific patterns',
            ],
          },
        ],
      })
      .render()
  )
  .input(
    z.object({
      pattern: z.string().describe('The regex pattern to search for in file contents'),

      path: z.string().optional().describe('The directory to search in. Defaults to the current working directory.'),
      include: z.string().optional().describe('File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")'),
    })
  )
  .output(z.string().describe('Search results'))
  .execute(({ context }) => async ({ pattern, path: location, include }) => {
    try {
      if (location) {
        if (!checkPatternIsRestricted(location)) {
          throw LlmToolExecutionError.build('grep', 'Pattern or path is going to out of scope the project');
        }
      }

      const rg = Rg.build();
      const results = await rg.exec(pattern, {
        path: location,
        limit: 50,

        include: include ? [include] : undefined,
        exclude: context.project.sources.ignore,
      });

      if (results.length === 0) {
        return 'No matches found.';
      }

      return results
        .map((match) => `${match.path.text}:${match.line_number}: ${_.truncate(match.lines.text.trim(), { length: 100 })}`)
        .join('\n');
    } catch (error: unknown) {
      throw LlmToolExecutionError.build('grep', error);
    }
  });
