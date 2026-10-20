import { resolveRequestBodyTransformer } from './overrides';

const schema = {
  type: 'object',
  properties: { a: { type: 'string' } },
};

it('should not resolve transformer for model without overrides', () => {
  expect(resolveRequestBodyTransformer('gemini/gemini-3-flash-preview')).toBeUndefined();
});

it('should replace json_schema response format with json_object for deepseek', () => {
  const transform = resolveRequestBodyTransformer('deepseek/deepseek-v4-flash')!;
  const result = transform({
    model: 'deepseek/deepseek-v4-flash',
    response_format: { type: 'json_schema', json_schema: { name: 'response', schema } },
    messages: [{ role: 'user', content: 'Hi' }],
  });

  expect(result.response_format).toEqual({ type: 'json_object' });
  expect(result.messages).toEqual([
    { role: 'system', content: `Respond ONLY with a json object matching this JSON Schema:\n${JSON.stringify(schema)}` },
    { role: 'user', content: 'Hi' },
  ]);
});

it('should keep deepseek request body without json_schema response format untouched', () => {
  const transform = resolveRequestBodyTransformer('deepseek/deepseek-v4-flash')!;
  const body = {
    model: 'deepseek/deepseek-v4-flash',
    messages: [{ role: 'user', content: 'Hi' }],
  };

  expect(transform(body)).toBe(body);
});
