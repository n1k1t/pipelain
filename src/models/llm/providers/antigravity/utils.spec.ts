import { tool } from 'ai';
import z from 'zod/v3';

import {
  compileAgent,
  compileEnv,
  compileMcpConfig,
  compileSettings,
  convertError,
  convertEvent,
  convertFinish,
  convertReasoning,
  convertToolName,
} from './utils';

import { LlmBridge } from '../../bridge';

it('compileEnv should pass connection key into GEMINI_API_KEY', () => {
  expect(compileEnv({ env: { PATH: '/bin' } })).toEqual({ PATH: '/bin' });
  expect(compileEnv({ env: {} }, { key: 'none' })).toEqual({});
  expect(compileEnv({ env: {} }, { key: 'key' })).toEqual({ GEMINI_API_KEY: 'key' });
});

it('compileSettings should allow non-workspace access and use gemini model provider with connection key', () => {
  expect(compileSettings({})).toEqual({ allowNonWorkspaceAccess: true });
  expect(compileSettings({}, { key: 'none' })).toEqual({ allowNonWorkspaceAccess: true });

  expect(compileSettings({}, { key: 'key' })).toEqual({
    allowNonWorkspaceAccess: true,
    modelProvider: 'gemini',
  });

  expect(compileSettings({ settings: { allowNonWorkspaceAccess: false } })).toEqual({ allowNonWorkspaceAccess: false });
});

it('compileAgent should compile agent without default tools and with system prompt as instructions', () => {
  expect(compileAgent({}, { system: 'System' })).toBe([
    '---',
    'name: pipelain',
    'description: Agent which runs pipelain pipeline prompts',
    'excludeDefaultComponents: true',
    'tools: []',
    '---',
    '# Instructions',
    '',
    'System',
    '',
  ].join('\n'));

  expect(compileAgent({ tools: ['run_command', 'view_file'] })).toContain('tools: ["run_command","view_file"]');
  expect(compileAgent({ tools: ['finish'] }, { structured: true })).toContain('tools: ["finish"]');
  expect(compileAgent({ tools: ['view_file'] }, { structured: true })).toContain('tools: ["view_file","finish"]');
  expect(compileAgent({})).toContain('Follow the user instructions');
});

it('compileMcpConfig should register bridge tools as eager', () => {
  const bridge = new LlmBridge({ read: tool({ inputSchema: z.object({}), execute: () => 'ok' }) });
  bridge.url = 'http://127.0.0.1:1/mcp';

  expect(compileMcpConfig(bridge)).toEqual({
    mcpServers: {
      pipelain: {
        url: 'http://127.0.0.1:1/mcp',
        headers: { Authorization: `Bearer ${bridge.token}` },
        tools: { read: { eager: true } },
      },
    },
  });
});

it('convertToolName should strip bridge prefix and mark other tools as dynamic', () => {
  expect(convertToolName('mcp_pipelain_read')).toEqual({ name: 'read', dynamic: false });
  expect(convertToolName('run_command')).toEqual({ name: 'run_command', dynamic: true });
});

it('convertEvent should convert init into response metadata', () => {
  expect(convertEvent({ event: 'init', conversation_id: 'c', init: { model: 'gemini' } }, new Set())).toEqual([
    { type: 'response-metadata', id: 'c', modelId: 'gemini', timestamp: expect.any(Date) },
  ]);
});

it('convertEvent should convert tool steps into tool call and result', () => {
  const called = new Set<string>();
  const step = { conversation_id: 'c', step_index: 2, step_type: 'tool', tool_name: 'mcp_pipelain_read' };

  expect(convertEvent({
    event: 'step_update',
    step_update: { ...step, state: 'ACTIVE', tool_info: { name: 'mcp_pipelain_read', parameters: { path: 'a' } } },
  }, called)).toEqual([
    { type: 'tool-call', toolCallId: 'c:2', toolName: 'read', input: '{"path":"a"}', providerExecuted: true },
  ]);

  expect(convertEvent({
    event: 'step_update',
    step_update: {
      ...step,
      state: 'DONE',
      tool_info: {
        name: 'mcp_pipelain_read',
        parameters: { path: 'a' },
        output: 'Created At: 2026-11-19T17:23:07+03:00\nCompleted At: 2026-11-19T17:23:07+03:00\n{"content":"a"}',
      },
    },
  }, called)).toEqual([
    { type: 'tool-result', toolCallId: 'c:2', toolName: 'read', result: '{"content":"a"}', isError: false },
  ]);
});

it('convertEvent should convert failed built-in tool step into dynamic call and error result', () => {
  expect(convertEvent({
    event: 'step_update',
    step_update: {
      conversation_id: 'c',
      step_index: 3,
      state: 'ERROR',
      step_type: 'tool',
      tool_info: { name: 'run_command', parameters: { CommandLine: 'ls' }, error: { type: 'TOOL_ERROR', message: 'denied' } },
    },
  }, new Set())).toEqual([
    { type: 'tool-call', toolCallId: 'c:3', toolName: 'run_command', input: '{"CommandLine":"ls"}', providerExecuted: true, dynamic: true },
    { type: 'tool-result', toolCallId: 'c:3', toolName: 'run_command', result: 'denied', isError: true, dynamic: true },
  ]);
});

it('convertEvent should skip agent responses', () => {
  expect(convertEvent({
    event: 'step_update',
    step_update: { conversation_id: 'c', step_index: 1, state: 'DONE', step_type: 'agent_response', text_delta: 'Hi' },
  }, new Set())).toEqual([]);
});

it('convertFinish should convert usage and metadata', () => {
  expect(convertFinish({
    conversation_id: 'c',
    status: 'SUCCESS',
    num_turns: 2,
    duration_seconds: 1.5,
    usage: { input_tokens: 10, output_tokens: 5, thinking_tokens: 3, cache_read_tokens: 20, total_tokens: 15 },
  })).toEqual({
    type: 'finish',
    finishReason: { unified: 'stop', raw: 'SUCCESS' },
    usage: {
      inputTokens: { total: 30, noCache: 10, cacheRead: 20, cacheWrite: 0 },
      outputTokens: { total: 5, text: undefined, reasoning: 3 },
    },
    providerMetadata: { antigravity: { conversationId: 'c', turns: 2, duration: 1.5 } },
  });
});

it('convertReasoning should convert reasoning into effort', () => {
  expect(convertReasoning('none')).toBe('low');
  expect(convertReasoning('medium')).toBe('medium');
  expect(convertReasoning('max')).toBe('max');
  expect(convertReasoning(undefined)).toBeUndefined();
});

it('convertError should convert result error into reason', () => {
  expect(convertError({ conversation_id: 'c', status: 'ERROR', error: 'failed' })).toBe('failed');
  expect(convertError({ conversation_id: 'c', status: 'ERROR', error: { message: 'failed' } })).toBe('failed');
  expect(convertError({ conversation_id: 'c', status: 'ERROR', error: { code: 1 } })).toBe('{"code":1}');
  expect(convertError({ conversation_id: 'c', status: 'CANCELED' })).toBe('Got result [CANCELED]');
});
