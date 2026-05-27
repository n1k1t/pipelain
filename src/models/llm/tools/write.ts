import minimatch from 'minimatch';
import { z } from 'zod/v3';

import { LlmToolCompiler, LlmToolExecutionError } from './model';
import { checkPatternIsRestricted } from './utils';
import { File } from '../../file';

export default LlmToolCompiler
  .build<{
    /** Allowed paths/minimatch patterns to write file */
    allowed?: string[];
  }>('Write contents to files')
  .input(
    z.object({
      path: z.string().describe('The path to the file to write'),
      content: z.string().describe('The content to write to the file'),
    })
  )
  .output(z.string().describe('Success message'))
  .execute(({ context, options }) => async ({ path, content }) => {
    try {
      if (!checkPatternIsRestricted(path)) {
        throw LlmToolExecutionError.build('write', `Path "${path}" is going to out of scope the project`);
      }
      if (options.allowed && !options.allowed.some((pattern) => minimatch(path, pattern, { matchBase: true }))) {
        throw LlmToolExecutionError.build('write', `Path "${path}" is not to be allowed to write. Examinate the task again`);
      }

      const file = await File.build(path, {
        cwd: context.project.cwd,
        state: 'new',
        strict: true,
      });

      await file.write(content);

      context.project.files.add(path);
      return `File "${path}" written successfully`;
    } catch (error: unknown) {
      throw LlmToolExecutionError.build('write', error);
    }
  });
