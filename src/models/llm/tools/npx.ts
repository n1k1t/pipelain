import { z } from 'zod/v3';

import { LlmToolCompiler, LlmToolExecutionError } from './model';
import { Bash } from '../../bash';

export default LlmToolCompiler
  .build('Run an npx command')
  .input(
    z.object({
      command: z.string().describe('The npx command to run (e.g., "tsc", "eslint")'),
    })
  )
  .output(z.string().describe('Command output'))
  .execute(({ context }) => async ({ command }) => {
    try {
      const bash = Bash.build({ argv0: 'npx', cwd: context.project.cwd });
      const result = await bash.exec(command);

      if (result.status === 'ERROR') {
        throw result.error;
      }

      return result.stdout;
    } catch (error: unknown) {
      throw LlmToolExecutionError.build('npx', error);
    }
  });
