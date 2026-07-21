import { z } from 'zod/v3';

import { LlmToolCompiler, LlmToolExecutionError } from './model';
import { Bash } from '../../bash';

export default LlmToolCompiler
  .build('Run an npm command')
  .input(
    z.object({
      command: z.string().describe('The npm command to run (e.g., "install", "test")'),
    })
  )
  .output(z.string().describe('Command output'))
  .execute(({ context }) => async ({ command }) => {
    try {
      const bash = Bash.build({ argv0: 'npm', cwd: context.project.cwd });
      const result = await bash.exec(command);

      if (result.status === 'ERROR') {
        throw result.error;
      }

      return result.stdout;
    } catch (error: unknown) {
      throw LlmToolExecutionError.build('npm', error);
    }
  });
