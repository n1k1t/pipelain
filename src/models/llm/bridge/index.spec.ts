import { tool } from 'ai';
import z from 'zod/v3';

import { LlmBridge } from './index';

const tools = {
  sum: tool({
    description: 'Sums numbers',
    inputSchema: z.object({ a: z.number(), b: z.number() }),
    execute: ({ a, b }) => ({ sum: a + b }),
  }),
  fail: tool({
    description: 'Fails',
    inputSchema: z.object({}),
    execute: async (): Promise<string> => {
      throw new Error('Boom');
    },
  }),
  described: tool({
    description: 'Without execute',
    inputSchema: z.object({}),
  }),
};

const request = (bridge: LlmBridge, body: object, token: string = bridge.token) => fetch(bridge.url!, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});

let bridge: LlmBridge;

beforeEach(async () => {
  bridge = await LlmBridge.build(tools)!.open();
});

afterEach(() => bridge.close());

it('build should expose only executable tools', () => {
  expect(bridge.name).toBe('pipelain');
  expect(Object.keys(bridge.tools)).toEqual(['sum', 'fail']);
  expect(bridge.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
});

it('build should return null without executable tools', () => {
  expect(LlmBridge.build({})).toBeNull();
  expect(LlmBridge.build({ described: tools.described })).toBeNull();
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

it('should list tools with JSON schema of input', async () => {
  const response = await request(bridge, { jsonrpc: '2.0', id: 2, method: 'tools/list' });

  expect((await response.json()).result.tools).toEqual([
    {
      name: 'sum',
      description: 'Sums numbers',
      inputSchema: expect.objectContaining({
        type: 'object',
        properties: { a: { type: 'number' }, b: { type: 'number' } },
        required: ['a', 'b'],
      }),
    },
    { name: 'fail', description: 'Fails', inputSchema: expect.objectContaining({ type: 'object' }) },
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
