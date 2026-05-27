import minimatch from 'minimatch';
import path from 'path';
import fs from 'fs/promises';

import { z } from 'zod/v3';

import { LlmToolCompiler, LlmToolExecutionError } from './model';
import { checkPatternIsRestricted } from './utils';

export default LlmToolCompiler
  .build<{
    /** Allowed paths/minimatch patterns to remove file */
    allowed?: string[];
  }>('Delete files or directories')
  .input(
    z.object({
      path: z.string().describe('The path to the file or directory to delete'),
    })
  )
  .output(z.string().describe('Success message'))
  .execute(({ context, options }) => async ({ path: location }) => {
    try {
      if (!checkPatternIsRestricted(location)) {
        throw LlmToolExecutionError.build('rm', `Path "${location}" is going to out of scope the project`);
      }
      if (options.allowed && !options.allowed.some((pattern) => minimatch(location, pattern, { matchBase: true }))) {
        throw LlmToolExecutionError.build('rm', `Path "${location}" is not to be allowed to edit. Examinate the task again`);
      }

      const stats = await fs.stat(path.join(context.project.cwd, location)).catch((): null => null);
      if (!stats) {
        throw LlmToolExecutionError.build('rm', `Path "${location}" does not exist`);
      }

      stats.isDirectory()
        ? await fs.rm(path.join(context.project.cwd, location), { recursive: true, force: true })
        : await fs.rm(path.join(context.project.cwd, location))

      context.project.files.rm(location);
      return `Path "${location}" deleted successfully`;
    } catch (error: unknown) {
      throw LlmToolExecutionError.build('rm', error);
    }
  });
