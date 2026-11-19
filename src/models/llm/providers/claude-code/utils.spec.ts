import {
  collectWarnings,
  compilePrompt,
  compileSchema,
  compileEnv,
  consumeToolOutput,
  convertEvent,
  convertReasoning,
  convertResult,
  isJsonRpcMessage,
} from './utils';

it('consumeToolOutput should await output and take the last value of streamed output', async () => {
  async function* stream() {
    yield 'a';
    yield 'b';
  }

  expect(await consumeToolOutput(Promise.resolve({ a: 1 }))).toEqual({ a: 1 });
  expect(await consumeToolOutput('plain')).toBe('plain');
  expect(await consumeToolOutput(stream())).toBe('b');
});

it('isJsonRpcMessage should check method', () => {
  expect(isJsonRpcMessage({ jsonrpc: '2.0', method: 'ping' })).toBe(true);
  expect(isJsonRpcMessage({ jsonrpc: '2.0' })).toBe(false);
  expect(isJsonRpcMessage(null)).toBe(false);
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

it('compileSchema should keep object schema and remove $schema', () => {
  const compiled = compileSchema({
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: { a: { type: 'string' } },
  });

  expect(compiled.value).toEqual({ type: 'object', properties: { a: { type: 'string' } } });
  expect(compiled.extract({ a: 'x' })).toEqual({ a: 'x' });
});

it('compileSchema should wrap non object schema into value property', () => {
  const compiled = compileSchema({ type: 'array', items: { type: 'number' } });

  expect(compiled.value).toEqual({
    type: 'object',
    properties: { value: { type: 'array', items: { type: 'number' } } },
    required: ['value'],
    additionalProperties: false,
  });

  expect(compiled.extract({ value: [1, 2] })).toEqual([1, 2]);
});

it('compilePrompt should split system and single user message', () => {
  const compiled = compilePrompt([
    { role: 'system', content: 'sys' },
    { role: 'user', content: [{ type: 'text', text: 'hi' }] },
  ]);

  expect(compiled).toEqual({ system: 'sys', user: 'hi', warnings: [] });
});

it('compilePrompt should render history as transcript', () => {
  const compiled = compilePrompt([
    { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
    { role: 'user', content: [{ type: 'text', text: 'bye' }] },
  ]);

  expect(compiled.system).toBeUndefined();
  expect(compiled.user).toBe('<user>\nhi\n</user>\n\n<assistant>\nhello\n</assistant>\n\n<user>\nbye\n</user>');
});

it('compilePrompt should warn about files', () => {
  const compiled = compilePrompt([
    {
      role: 'user',
      content: [
        { type: 'text', text: 'hi' },
        { type: 'file', mediaType: 'image/png', data: { type: 'url', url: new URL('https://example.com/a.png') } },
      ],
    },
  ]);

  expect(compiled.user).toBe('hi');
  expect(compiled.warnings).toEqual([expect.objectContaining({ type: 'unsupported', feature: 'file' })]);
});

it('collectWarnings should warn about unsupported settings and tools', () => {
  const warnings = collectWarnings({
    prompt: [],
    temperature: 0.5,
    tools: [{ type: 'function', name: 'read', inputSchema: { type: 'object' } }],
  });

  expect(warnings.map((warning) => 'feature' in warning && warning.feature)).toEqual(['temperature', 'tools']);
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

it('collectWarnings should skip bridged tools', () => {
  const warnings = collectWarnings({
    prompt: [],
    tools: [
      { type: 'function', name: 'read', inputSchema: { type: 'object' } },
      { type: 'function', name: 'write', inputSchema: { type: 'object' } },
    ],
  }, ['read']);

  expect(warnings).toEqual([expect.objectContaining({ feature: 'tools', details: expect.stringContaining('[write]') })]);
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
