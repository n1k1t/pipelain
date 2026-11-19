import { APICallError } from 'ai';

import { LlmClaudeCodeError } from './errors';
import { LlmClaudeCodeCli } from './cli';

it('check should reject with LlmClaudeCodeError when executable is not found', async () => {
  const error = await LlmClaudeCodeCli.check('claude-code-not-existing-executable').catch((error: unknown) => error);

  expect(error).toBeInstanceOf(LlmClaudeCodeError);
  expect(APICallError.isInstance(error)).toBe(true);
  expect((<LlmClaudeCodeError>error).message).toBe(
    'Cannot use Claude Code CLI [claude-code-not-existing-executable]: executable is not found'
  );
});

it('doStream should emit APICallError when executable is not found', async () => {
  const cli = LlmClaudeCodeCli.build('haiku', { executable: 'claude-code-not-existing-executable' });
  await expect(cli.doStream({ prompt: [] })).rejects.toThrow('executable is not found');
});
