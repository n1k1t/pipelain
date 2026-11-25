import { consumeToolOutput, isJsonRpcMessage } from './utils';

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
