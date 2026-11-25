import { collectStream, collectWarnings, compilePrompt, compileSchema, convertToolContent } from './utils';
import { TLlmStreamPart } from './types';

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
  ], 'CLI');

  expect(compiled).toEqual({ system: 'sys', user: 'hi', warnings: [] });
});

it('compilePrompt should render history as transcript', () => {
  const compiled = compilePrompt([
    { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
    { role: 'user', content: [{ type: 'text', text: 'bye' }] },
  ], 'CLI');

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
  ], 'CLI');

  expect(compiled.user).toBe('hi');
  expect(compiled.warnings).toEqual([
    expect.objectContaining({ type: 'unsupported', feature: 'file', details: 'Files are not passed to CLI' }),
  ]);
});

it('collectWarnings should warn about unsupported settings and tools', () => {
  const warnings = collectWarnings({
    prompt: [],
    temperature: 0.5,
    tools: [{ type: 'function', name: 'read', inputSchema: { type: 'object' } }],
  }, 'CLI');

  expect(warnings.map((warning) => 'feature' in warning && warning.feature)).toEqual(['temperature', 'tools']);
});

it('collectWarnings should skip bridged tools', () => {
  const warnings = collectWarnings({
    prompt: [],
    tools: [
      { type: 'function', name: 'read', inputSchema: { type: 'object' } },
      { type: 'function', name: 'write', inputSchema: { type: 'object' } },
    ],
  }, 'CLI', ['read']);

  expect(warnings).toEqual([
    expect.objectContaining({ feature: 'tools', details: 'Tools [write] are not executable and are not passed to CLI' }),
  ]);
});

it('convertToolContent should join text blocks and keep other content', () => {
  expect(convertToolContent([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }])).toBe('a\nb');
  expect(convertToolContent([{ type: 'image', data: 'x' }])).toEqual([{ type: 'image', data: 'x' }]);
  expect(convertToolContent('plain')).toBe('plain');
  expect(convertToolContent(undefined)).toBe('');
});

it('collectStream should collect parts into generate result and throw stream errors', async () => {
  const build = (parts: TLlmStreamPart[]) => new ReadableStream<TLlmStreamPart>({
    start: (controller) => {
      parts.forEach((part) => controller.enqueue(part));
      controller.close();
    },
  });

  const result = await collectStream(build([
    { type: 'stream-start', warnings: [{ type: 'unsupported', feature: 'seed' }] },
    { type: 'text-delta', id: 't', delta: 'hi' },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end' },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 2, text: undefined, reasoning: undefined },
      },
    },
  ]));

  expect(result.content).toEqual([{ type: 'text', text: 'hi' }]);
  expect(result.warnings).toEqual([{ type: 'unsupported', feature: 'seed' }]);
  expect(result.finishReason).toEqual({ unified: 'stop', raw: 'end' });

  await expect(collectStream(build([{ type: 'error', error: new Error('Boom') }]))).rejects.toThrow('Boom');
});
