import { APICallError, tool } from 'ai';
import z from 'zod/v3';

import { LlmCodexProvider } from './index';
import { LlmCodexError } from './errors';
import { LlmCodexCli } from './cli';
import { LlmRouter } from '../../router';
import { Project } from '../../../project';

it('LlmCodexProvider.build should create provider without connection', () => {
  const provider = LlmCodexProvider.build('gpt-5', { options: { tools: ['shell'] } });

  expect(provider.name).toBe('codex');
  expect(provider.connection).toEqual({ key: 'none' });
});

it('clone should create a new instance with copied options', () => {
  const provider = LlmCodexProvider.build('gpt-5', { reasoning: 'high', options: { tools: ['shell'] } });
  const cloned = provider.clone();

  expect(cloned).not.toBe(provider);
  expect(cloned.options).not.toBe(provider.options);

  expect(cloned.options).toEqual({ tools: ['shell'] });
  expect(cloned.reasoning).toBe('high');
});

it('compile should build model with actual options, connection, executable tools and project', () => {
  const tools = { read: tool({ inputSchema: z.object({}), execute: () => 'ok' }) };
  const project = new Project({ cwd: '/project', sources: { skills: {}, ignore: [], files: [] } });
  const provider = LlmCodexProvider
    .build('gpt-5', { connection: { key: 'key' } })
    .assign({ options: { executable: '/bin/codex' } });

  const model = <LlmCodexCli>provider.compile({ tools, project });

  expect(model).toBeInstanceOf(LlmCodexCli);
  expect(model.executable).toBe('/bin/codex');
  expect(model.connection).toEqual({ key: 'key' });
  expect(model.compilation).toEqual({ tools, project });
});

it('LlmRouter should provide LlmCodexProvider for codex provider', () => {
  const provider = LlmRouter
    .build({ provider: 'codex', key: 'none' })
    .setup('codex', { options: { tools: ['web_search'] } })
    .provide('gpt-5');

  expect(provider).toBeInstanceOf(LlmCodexProvider);
  expect(provider.options).toEqual({ tools: ['web_search'] });
});

it('check should reject with LlmCodexError when executable is not found', async () => {
  const error = await LlmCodexCli.check('codex-not-existing-executable').catch((error: unknown) => error);

  expect(error).toBeInstanceOf(LlmCodexError);
  expect(APICallError.isInstance(error)).toBe(true);
  expect((<LlmCodexError>error).message).toBe('Cannot use Codex CLI [codex-not-existing-executable]: executable is not found');
});
