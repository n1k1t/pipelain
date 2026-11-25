import {
  compileMcpConfig,
  compileEnv,
  convertEvent,
  convertReasoning,
  convertResult,
} from './utils';

import { LlmBridge } from '../../bridge';

it('compileMcpConfig should compile HTTP MCP config of the bridge', () => {
  const bridge = new LlmBridge({});
  bridge.url = 'http://127.0.0.1:1/mcp';

  expect(compileMcpConfig(bridge)).toEqual({
    mcpServers: {
      pipelain: { type: 'http', url: 'http://127.0.0.1:1/mcp', headers: { Authorization: `Bearer ${bridge.token}` } },
    },
  });
});

it('compileEnv should keep env as is without connection key', () => {
  const env = { PATH: '/bin', ANTHROPIC_API_KEY: 'global' };

  expect(compileEnv({ env })).toEqual(env);
  expect(compileEnv({ env }, { key: 'none' })).toEqual(env);
});

it('compileEnv should pass connection key into CLAUDE_CODE_OAUTH_TOKEN by default and remove other auth variables', () => {
  const env = compileEnv({ env: { PATH: '/bin', ANTHROPIC_API_KEY: 'global' } }, { key: 'token' });
  expect(env).toEqual({ PATH: '/bin', CLAUDE_CODE_OAUTH_TOKEN: 'token' });
});

it('compileEnv should pass connection key into variable of auth option', () => {
  expect(compileEnv({ env: {}, auth: 'api-key' }, { key: 'key' })).toEqual({ ANTHROPIC_API_KEY: 'key' });
  expect(compileEnv({ env: {}, auth: 'bearer' }, { key: 'key' })).toEqual({ ANTHROPIC_AUTH_TOKEN: 'key' });
});

it('compileEnv should pass connection url into ANTHROPIC_BASE_URL', () => {
  const env = compileEnv({ env: {}, auth: 'bearer' }, { key: 'key', url: 'https://proxy' });
  expect(env).toEqual({ ANTHROPIC_AUTH_TOKEN: 'key', ANTHROPIC_BASE_URL: 'https://proxy' });
});

it('convertReasoning should map reasoning into effort', () => {
  expect(convertReasoning('none')).toBe('low');
  expect(convertReasoning('medium')).toBe('medium');
  expect(convertReasoning('max')).toBe('max');
  expect(convertReasoning('provider-default')).toBeUndefined();
  expect(convertReasoning()).toBeUndefined();
});

it('convertEvent should convert thinking and tools and skip StructuredOutput', () => {
  const tools = new Map<string, string>();

  const assistant = convertEvent({
    type: 'assistant',
    message: {
      id: 'msg',
      content: [
        { type: 'thinking', thinking: 'hmm' },
        { type: 'tool_use', id: 't1', name: 'Read', input: { path: 'a' } },
        { type: 'tool_use', id: 't2', name: 'StructuredOutput', input: { a: 1 } },
      ],
    },
  }, tools);

  expect(assistant.map((part) => part.type)).toEqual(['reasoning-start', 'reasoning-delta', 'reasoning-end', 'tool-call']);
  expect(assistant[3]).toEqual(expect.objectContaining({ toolName: 'Read', providerExecuted: true, dynamic: true }));

  const user = convertEvent({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 't1', content: 'file' },
        { type: 'tool_result', tool_use_id: 't2', content: 'ok' },
      ],
    },
  }, tools);

  expect(user).toEqual([expect.objectContaining({ type: 'tool-result', toolCallId: 't1', toolName: 'Read', result: 'file' })]);
});

it('convertEvent should remove bridge prefix from pipeline tools', () => {
  const tools = new Map<string, string>();

  const [call] = convertEvent({
    type: 'assistant',
    message: { id: 'msg', content: [{ type: 'tool_use', id: 't1', name: 'mcp__pipelain__read', input: { path: 'a' } }] },
  }, tools);

  expect(call).toEqual({ type: 'tool-call', toolCallId: 't1', toolName: 'read', input: '{"path":"a"}', providerExecuted: true });

  const [result] = convertEvent({
    type: 'user',
    message: {
      content: [{
        type: 'tool_result',
        tool_use_id: 't1',
        content: [{ type: 'text', text: 'line 1' }, { type: 'text', text: 'line 2' }],
      }],
    },
  }, tools);

  expect(result).toEqual({ type: 'tool-result', toolCallId: 't1', toolName: 'read', result: 'line 1\nline 2', isError: false });
});

it('convertResult should convert usage and metadata', () => {
  const finish = convertResult({
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: 's',
    num_turns: 2,
    total_cost_usd: 0.1,
    usage: {
      input_tokens: 2,
      output_tokens: 10,
      cache_read_input_tokens: 3,
      cache_creation_input_tokens: 5,
      output_tokens_details: { thinking_tokens: 4 },
    },
  });

  expect(finish.usage.inputTokens).toEqual({ total: 10, noCache: 2, cacheRead: 3, cacheWrite: 5 });
  expect(finish.usage.outputTokens).toEqual({ total: 10, text: undefined, reasoning: 4 });
  expect(finish.providerMetadata).toEqual({ 'claude-code': { sessionId: 's', turns: 2, cost: 0.1 } });
});
