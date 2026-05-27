import minimatch from 'minimatch';
import path from 'path';

import { lock } from 'proper-lockfile';
import { z } from 'zod/v3';

import { LlmToolCompiler, LlmToolExecutionError } from './model';
import { checkPatternIsRestricted } from './utils';
import { TFunction } from '../../../../types';
import { File } from '../../file';
import { cast } from '../../../utils';

export default LlmToolCompiler
  .build<{
    /** Allowed paths/minimatch patterns to edit file */
    allowed?: string[];
  }>('Edit a file by replacing lines fragment with another string')
  .input(
    z.object({
      path: z.string().describe('The path to the file to edit'),

      replacements: z.array(
        z.object({
          source: z.string().describe('The source lines fragment to replace'),
          target: z.string().describe('The string to replace it with'),
        }).describe('File replacement details'),
      ).describe('List of file replacements'),
    })
  )
  .output(z.string().describe('Success message'))
  .execute(({ context, vfs, options }) => async ({ path: location, replacements }) => {
    const mutex = {
      release: cast<null | TFunction<Promise<void>>>(null),
    };

    try {
      if (location.startsWith('__vfs__/')) {
        throw LlmToolExecutionError.build(
          'edit',
          'Cannot edit virtual file. Only `read` tool is allowed to work with this file'
        );
      }

      if (!checkPatternIsRestricted(location)) {
        throw LlmToolExecutionError.build('edit', `Path "${location}" is going to out of scope the project`);
      }

      if (options.allowed && !options.allowed.some((pattern) => minimatch(location, pattern, { matchBase: true }))) {
        throw LlmToolExecutionError.build('edit', `Path "${location}" is not to be allowed to edit. Examinate the task again`);
      }

      mutex.release = await lock(path.join(context.project.cwd, location), {
        stale: 10000,
        update: 1000,
        retries: 10,
      });

      const file = await File.build(location, {
        cwd: context.project.cwd,
        state: 'existent',
        strict: true,
      });

      replacements.forEach(({ source, target }) => file.replace(source, target));
      await file.write();

      return `File "${location}" edited successfully`;
    } catch (error: unknown) {
      throw LlmToolExecutionError.build('edit', error);
    } finally {
      await mutex.release?.();
    }
  });
