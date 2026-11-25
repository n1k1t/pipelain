import { APICallError, tool } from 'ai';
import z from 'zod/v3';

import { LlmAntigravityProvider } from './index';
import { LlmAntigravityError } from './errors';
import { LlmAntigravityCli } from './cli';
import { LlmRouter } from '../../router';
import { Project } from '../../../project';

it('LlmAntigravityProvider.build should create provider without connection', () => {
  const provider = LlmAntigravityProvider.build('gemini-3.8-flash-low', { options: { tools: ['run_command'] } });

  expect(provider.name).toBe('antigravity');
  expect(provider.connection).toEqual({ key: 'none' });
});

it('clone should create a new instance with copied options', () => {
  const provider = LlmAntigravityProvider.build('gemini-3.8-flash-low', { reasoning: 'high', options: { tools: ['run_command'] } });
  const cloned = provider.clone();

  expect(cloned).not.toBe(provider);
  expect(cloned.options).not.toBe(provider.options);

  expect(cloned.options).toEqual({ tools: ['run_command'] });
  expect(cloned.reasoning).toBe('high');
});

it('compile should build model with actual options, connection, executable tools and project', () => {
  const tools = { read: tool({ inputSchema: z.object({}), execute: () => 'ok' }) };
  const project = new Project({ cwd: '/project', sources: { skills: {}, ignore: [], files: [] } });
  const provider = LlmAntigravityProvider
    .build('gemini-3.8-flash-low', { connection: { key: 'key' } })
    .assign({ options: { executable: '/bin/agy' } });

  const model = <LlmAntigravityCli>provider.compile({ tools, project });

  expect(model).toBeInstanceOf(LlmAntigravityCli);
  expect(model.executable).toBe('/bin/agy');
  expect(model.connection).toEqual({ key: 'key' });
  expect(model.compilation).toEqual({ tools, project });
});

it('LlmRouter should provide LlmAntigravityProvider for antigravity provider', () => {
  const provider = LlmRouter
    .build({ provider: 'antigravity', key: 'none' })
    .setup('antigravity', { options: { tools: ['view_file'] } })
    .provide('gemini-3.8-flash-low');

  expect(provider).toBeInstanceOf(LlmAntigravityProvider);
  expect(provider.options).toEqual({ tools: ['view_file'] });
});

it('check should reject with LlmAntigravityError when executable is not found', async () => {
  const error = await LlmAntigravityCli.check('agy-not-existing-executable').catch((error: unknown) => error);

  expect(error).toBeInstanceOf(LlmAntigravityError);
  expect(APICallError.isInstance(error)).toBe(true);
  expect((<LlmAntigravityError>error).message).toBe('Cannot use Antigravity CLI [agy-not-existing-executable]: executable is not found');
});
