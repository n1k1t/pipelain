import { tool } from 'ai';
import z from 'zod/v3';

import { LlmClaudeCodeBridge } from './bridge';

const definitions = [
  { type: 'function', name: 'sum', description: 'Sums numbers', inputSchema: { type: 'object' } },
  { type: 'function', name: 'fail', description: 'Fails', inputSchema: { type: 'object' } },
  { type: 'function', name: 'described', description: 'Without execute', inputSchema: { type: 'object' } },
] as const;

const tools = {
  sum: tool({
    inputSchema: z.object({ a: z.number(), b: z.number() }),
    execute: ({ a, b }) => ({ sum: a + b }),
  }),
  fail: tool({
    inputSchema: z.object({}),
    execute: async (): Promise<string> => {
      throw new Error('Boom');
    },
  }),
  described: tool({
    inputSchema: z.object({}),
  }),
};

const request = (bridge: LlmClaudeCodeBridge, body: object, token: string = bridge.token) => fetch(bridge.url!, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});

let bridge: LlmClaudeCodeBridge;

beforeEach(async () => {
  bridge = await LlmClaudeCodeBridge.build(tools, [...definitions]).open();
});

afterEach(() => bridge.close());

it('build should expose only executable tools', () => {
  expect(bridge.names).toEqual(['sum', 'fail']);
  expect(bridge.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  expect(bridge.config).toEqual({
    mcpServers: {
      pipelain: { type: 'http', url: bridge.url, headers: { Authorization: `Bearer ${bridge.token}` } },
    },
  });
});

it('should reject requests without token', async () => {
  const response = await request(bridge, { jsonrpc: '2.0', id: 1, method: 'ping' }, 'wrong');
  expect(response.status).toBe(401);
});

it('should reject non POST requests', async () => {
  const response = await fetch(bridge.url!, { headers: { Authorization: `Bearer ${bridge.token}` } });
  expect(response.status).toBe(405);
});

it('should answer initialize with client protocol version', async () => {
  const response = await request(bridge, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-03-26' },
  });

  expect(await response.json()).toEqual({
    jsonrpc: '2.0',
    id: 1,
    result: {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'pipelain', version: '1.0.0' },
    },
  });
});

it('should accept notifications', async () => {
  const response = await request(bridge, { jsonrpc: '2.0', method: 'notifications/initialized' });
  expect(response.status).toBe(202);
});

it('should list tools', async () => {
  const response = await request(bridge, { jsonrpc: '2.0', id: 2, method: 'tools/list' });

  expect((await response.json()).result.tools).toEqual([
    { name: 'sum', description: 'Sums numbers', inputSchema: { type: 'object' } },
    { name: 'fail', description: 'Fails', inputSchema: { type: 'object' } },
  ]);
});

it('should call tool', async () => {
  const response = await request(bridge, {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'sum', arguments: { a: 1, b: 2 } },
  });

  expect((await response.json()).result).toEqual({ content: [{ type: 'text', text: '{"sum":3}' }] });
});

it('should return tool errors and unknown tools as error results', async () => {
  expect(await bridge.call('fail', {})).toEqual({ isError: true, content: [{ type: 'text', text: 'Boom' }] });
  expect(await bridge.call('described', {})).toEqual({
    isError: true,
    content: [{ type: 'text', text: 'Tool [described] is not found' }],
  });
});

it('should answer unknown methods with error', async () => {
  const response = await request(bridge, { jsonrpc: '2.0', id: 4, method: 'resources/list' });
  expect((await response.json()).error).toEqual({ code: -32601, message: 'Method [resources/list] is not found' });
});

it('close should stop the server', async () => {
  await bridge.close();
  await expect(request(bridge, { jsonrpc: '2.0', id: 5, method: 'ping' })).rejects.toThrow();
});
