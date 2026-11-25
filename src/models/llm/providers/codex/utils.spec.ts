import {
  compileBridgeConfig,
  compileConfig,
  compileEnv,
  compileToolsConfig,
  convertEvent,
  convertFinish,
  convertReasoning,
  sanitizeSchema,
} from './utils';

import { LlmBridge } from '../../bridge';

it('compileEnv should pass connection key, url and bridge token', () => {
  const bridge = new LlmBridge({});

  expect(compileEnv({ env: { PATH: '/bin' } })).toEqual({ PATH: '/bin' });
  expect(compileEnv({ env: {} }, { key: 'none' })).toEqual({});

  expect(compileEnv({ env: {} }, { key: 'key', url: 'https://proxy' }, bridge)).toEqual({
    CODEX_API_KEY: 'key',
    OPENAI_BASE_URL: 'https://proxy',
    PIPELAIN_BRIDGE_TOKEN: bridge.token,
  });
});

it('compileConfig should flatten nested objects into dotted keys with JSON values', () => {
  expect(compileConfig({
    approval_policy: 'never',
    tools: { web_search: true },
    list: ['a'],
  })).toEqual([
    '-c', 'approval_policy="never"',
    '-c', 'tools.web_search=true',
    '-c', 'list=["a"]',
  ]);
});

it('compileToolsConfig should enable listed built-in tools and disable others', () => {
  expect(compileConfig(compileToolsConfig())).toEqual([
    '-c', 'features.shell_tool=false',
    '-c', 'tools.web_search=false',
    '-c', 'features.view_image=false',
    '-c', 'features.image_generation=false',
  ]);

  expect(compileToolsConfig(['shell', 'web_search'])).toEqual({
    'features.shell_tool': true,
    'tools.web_search': true,
    'features.view_image': false,
    'features.image_generation': false,
  });
});

it('compileBridgeConfig should pass bridge url and token variable', () => {
  const bridge = new LlmBridge({});
  bridge.url = 'http://127.0.0.1:1/mcp';

  expect(compileConfig(compileBridgeConfig(bridge))).toEqual([
    '-c', 'mcp_servers.pipelain.url="http://127.0.0.1:1/mcp"',
    '-c', 'mcp_servers.pipelain.bearer_token_env_var="PIPELAIN_BRIDGE_TOKEN"',
  ]);
});

it('sanitizeSchema should remove format and pattern but keep properties with the same names', () => {
  expect(sanitizeSchema({
    type: 'object',
    properties: {
      format: { type: 'string', format: 'email' },
      items: { type: 'array', items: { type: 'string', pattern: '^a' } },
    },
  })).toEqual({
    type: 'object',
    properties: {
      format: { type: 'string' },
      items: { type: 'array', items: { type: 'string' } },
    },
  });
});

it('convertReasoning should pass reasoning except provider default', () => {
  expect(convertReasoning('low')).toBe('low');
  expect(convertReasoning('max')).toBe('max');
  expect(convertReasoning('provider-default')).toBeUndefined();
  expect(convertReasoning()).toBeUndefined();
});

it('convertEvent should convert thread and reasoning', () => {
  const called = new Set<string>();

  expect(convertEvent({ type: 'thread.started', thread_id: 't' }, called)).toEqual([
    expect.objectContaining({ type: 'response-metadata', id: 't' }),
  ]);

  expect(convertEvent({ type: 'item.completed', item: { id: 'r', type: 'reasoning', text: 'hmm' } }, called)).toEqual([
    { type: 'reasoning-start', id: 'r' },
    { type: 'reasoning-delta', id: 'r', delta: 'hmm' },
    { type: 'reasoning-end', id: 'r' },
  ]);

  expect(convertEvent({ type: 'item.completed', item: { id: 'm', type: 'agent_message', text: 'hi' } }, called)).toEqual([]);
});

it('convertEvent should emit tool call once and tool result on completion', () => {
  const called = new Set<string>();
  const item = { id: 'c', type: 'command_execution', command: 'ls', status: 'in_progress' };

  expect(convertEvent({ type: 'item.started', item }, called)).toEqual([{
    type: 'tool-call',
    toolCallId: 'c',
    toolName: 'exec',
    input: '{"command":"ls"}',
    providerExecuted: true,
    dynamic: true,
  }]);

  expect(convertEvent({
    type: 'item.completed',
    item: { ...item, status: 'completed', exit_code: 1, aggregated_output: 'error' },
  }, called)).toEqual([{
    type: 'tool-result',
    toolCallId: 'c',
    toolName: 'exec',
    result: 'error',
    isError: true,
    dynamic: true,
  }]);
});

it('convertEvent should convert bridged MCP tools into pipeline tools', () => {
  const parts = convertEvent({
    type: 'item.completed',
    item: {
      id: 'm',
      type: 'mcp_tool_call',
      server: 'pipelain',
      tool: 'read',
      arguments: { path: 'a' },
      result: { content: [{ type: 'text', text: 'file' }] },
      status: 'completed',
    },
  }, new Set());

  expect(parts).toEqual([
    { type: 'tool-call', toolCallId: 'm', toolName: 'read', input: '{"path":"a"}', providerExecuted: true },
    { type: 'tool-result', toolCallId: 'm', toolName: 'read', result: 'file', isError: false },
  ]);
});

it('convertEvent should keep other MCP servers dynamic', () => {
  const [call] = convertEvent({
    type: 'item.started',
    item: { id: 'm', type: 'mcp_tool_call', server: 'docs', tool: 'search', arguments: {} },
  }, new Set());

  expect(call).toEqual(expect.objectContaining({ toolName: 'docs.search', dynamic: true }));
});

it('convertFinish should convert usage and thread', () => {
  const finish = convertFinish({
    thread: 't',
    usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 5, reasoning_output_tokens: 2 },
  });

  expect(finish.usage.inputTokens).toEqual({ total: 10, noCache: 6, cacheRead: 4, cacheWrite: undefined });
  expect(finish.usage.outputTokens).toEqual({ total: 5, text: undefined, reasoning: 2 });
  expect(finish.providerMetadata).toEqual({ codex: { threadId: 't' } });
});
