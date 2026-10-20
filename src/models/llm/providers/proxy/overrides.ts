type TLlmProxyRequestBody = Record<string, any>;

export interface ILlmProxyOverride {
  match: (model: string) => boolean;
  transform: (body: TLlmProxyRequestBody) => TLlmProxyRequestBody;
}

/** DeepSeek chat completions API does not support `json_schema` response format */
const deepseek: ILlmProxyOverride = {
  match: (model) => model.includes('deepseek'),
  transform: (body) => {
    if (body.response_format?.type !== 'json_schema') {
      return body;
    }

    const { schema } = body.response_format.json_schema ?? {};

    return {
      ...body,

      response_format: { type: 'json_object' },
      messages: [
        ...(schema ? [{
          role: 'system',
          content: `Respond ONLY with a json object matching this JSON Schema:\n${JSON.stringify(schema)}`,
        }] : []),

        ...(body.messages ?? []),
      ],
    };
  },
};

export const overrides: ILlmProxyOverride[] = [deepseek];

export const resolveRequestBodyTransformer = (model: string) => {
  const matched = overrides.filter((override) => override.match(model));

  if (!matched.length) {
    return undefined;
  }

  return (body: TLlmProxyRequestBody) => matched.reduce((acc, override) => override.transform(acc), body);
};
