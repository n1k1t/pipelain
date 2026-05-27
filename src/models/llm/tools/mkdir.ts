import path from 'path';
import fs from 'fs/promises';

import { z } from 'zod/v3';

import { LlmToolCompiler, LlmToolExecutionError } from './model';
import { checkPatternIsRestricted } from './utils';

export default LlmToolCompiler
  .build('Create directory')
  .input(
    z.object({
      path: z.string().describe('The path to the directory to create'),
    })
  )
  .output(z.string().describe('Success message'))
  .execute(({ context }) => async ({ path: location }) => {
    try {
      if (!checkPatternIsRestricted(location)) {
        throw LlmToolExecutionError.build('mkdir', `Path "${location}" is going to out of scope the project`);
      }

      await fs.mkdir(path.join(context.project.cwd, location), { recursive: true });
      return `Directory "${location}" created successfully`;
    } catch (error: unknown) {
      throw LlmToolExecutionError.build('mkdir', error);
    }
  });
