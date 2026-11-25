import { tool } from 'ai';
import z from 'zod/v3';

import { LlmClaudeCodeProvider } from './index';
import { LlmClaudeCodeCli } from './cli';
import { LlmRouter } from '../../router';
import { Project } from '../../../project';

const project = new Project({ cwd: '/project', sources: { skills: {}, ignore: [], files: [] } });
const compile = (provider: LlmClaudeCodeProvider) => <LlmClaudeCodeCli>provider.compile({ tools: {}, project });

it('LlmClaudeCodeProvider.build should create provider without connection', () => {
  const provider = LlmClaudeCodeProvider.build('haiku', { options: { tools: ['Read'] } });

  expect(provider.name).toBe('claude-code');
  expect(provider.connection).toEqual({ key: 'none' });
  expect(compile(provider)).toBeInstanceOf(LlmClaudeCodeCli);
  expect(compile(provider).options).toEqual({ tools: ['Read'] });
});

it('clone should create a new instance with copied options', () => {
  const provider = LlmClaudeCodeProvider.build('haiku', { reasoning: 'high', options: { tools: ['Read'] } });
  const cloned = provider.clone();

  expect(cloned).not.toBe(provider);
  expect(cloned.options).not.toBe(provider.options);

  expect(cloned.options).toEqual({ tools: ['Read'] });
  expect(cloned.reasoning).toBe('high');
});

it('compile should use options from assign', () => {
  const provider = LlmClaudeCodeProvider.build('haiku', {}).assign({ options: { executable: '/bin/claude' } });
  expect(compile(provider).executable).toBe('/bin/claude');
});

it('compile should pass provider connection', () => {
  const provider = LlmClaudeCodeProvider.build('haiku', {
    connection: { key: 'token' },
    options: { auth: 'api-key' },
  });

  expect(compile(provider).connection).toEqual({ key: 'token' });
  expect(compile(provider).options.auth).toBe('api-key');
});

it('compile should build model with executable tools and project', () => {
  const tools = { read: tool({ inputSchema: z.object({}), execute: () => 'ok' }) };
  const model = <LlmClaudeCodeCli>LlmClaudeCodeProvider.build('haiku', {}).compile({ tools, project });

  expect(model).toBeInstanceOf(LlmClaudeCodeCli);
  expect(model.compilation).toEqual({ tools, project });
});

it('LlmRouter should provide LlmClaudeCodeProvider for claude-code provider', () => {
  const provider = LlmRouter
    .build({ provider: 'claude-code', key: 'none' })
    .setup('claude-code', { options: { tools: ['Read'] } })
    .provide('sonnet');

  expect(provider).toBeInstanceOf(LlmClaudeCodeProvider);
  expect(provider.options).toEqual({ tools: ['Read'] });
});
