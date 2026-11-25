import _ from 'lodash';

import type {
  TLlmCallOptions,
  TLlmFinishPart,
  TLlmGenerateResult,
  TLlmStreamPart,
  TLlmWarning,
} from './types';

/** Usage without tokens (used until the model reports its usage) */
export const compileEmptyUsage = (): TLlmFinishPart['usage'] => ({
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: undefined, reasoning: undefined },
});

/**
 * Splits the prompt into the system prompt and the user message (history is rendered as a transcript)
 * Files are skipped with a warning because agent CLIs receive only text
 */
export const compilePrompt = (prompt: TLlmCallOptions['prompt'], cli: string): {
  system?: string;
  user: string;
  warnings: TLlmWarning[];
} => {
  const warnings: TLlmWarning[] = [];
  const system = prompt.flatMap((message) => message.role === 'system' ? [message.content] : []);
  const messages = prompt.filter((message) => message.role !== 'system');

  const render = (message: (typeof messages)[number]): string => message.content
    .map((part) => {
      switch (part.type) {
        case 'text': return part.text;
        case 'tool-call': return `[tool call ${part.toolName}] ${JSON.stringify(part.input)}`;
        case 'tool-result': return `[tool result ${part.toolName}] ${JSON.stringify(part.output)}`;

        case 'file': {
          warnings.push({ type: 'unsupported', feature: 'file', details: `Files are not passed to ${cli}` });
          return '';
        }

        default: return '';
      }
    })
    .filter((text) => text.length)
    .join('\n');

  const user = messages.length === 1 && messages[0].role === 'user'
    ? render(messages[0])
    : messages.map((message) => `<${message.role}>\n${render(message)}\n</${message.role}>`).join('\n\n');

  return {
    user,
    warnings,

    ...(system.length && { system: system.join('\n\n') }),
  };
};

/**
 * Compiles JSON schema with `object` root (agent CLIs accept only objects as structured output)
 * A schema with another root is wrapped into `{ value }` object and extracted back from the output
 */
export const compileSchema = (schema: object): {
  value: object;
  extract: (output: unknown) => unknown;
} => {
  const { $schema, ...value } = <{ $schema?: string, type?: unknown }>schema;

  if (value.type === 'object') {
    return { value, extract: (output) => output };
  }

  return {
    value: {
      type: 'object',
      properties: { value },

      required: ['value'],
      additionalProperties: false,
    },

    extract: (output) => _.isObject(output) && 'value' in output ? output.value : output,
  };
};

/** Collects warnings about call options which are not supported by agent CLIs (bridged tools are supported) */
export const collectWarnings = (options: TLlmCallOptions, cli: string, bridged: string[] = []): TLlmWarning[] => {
  const unsupported = <const>['temperature', 'topP', 'topK', 'seed', 'stopSequences', 'presencePenalty', 'frequencyPenalty'];
  const skipped = (options.tools ?? []).filter((tool) => !bridged.includes(tool.name));

  return [
    ...unsupported
      .filter((feature) => options[feature] !== undefined)
      .map((feature): TLlmWarning => ({ type: 'unsupported', feature })),

    ...(skipped.length
      ? [<TLlmWarning>{
        type: 'unsupported',
        feature: 'tools',
        details: `Tools [${skipped.map((tool) => tool.name).join(', ')}] are not executable and are not passed to ${cli}`,
      }]
      : []),
  ];
};

/** Joins text blocks of MCP tool result content (other content is kept as is) */
export const convertToolContent = (content: unknown): unknown => {
  const blocks = Array.isArray(content) ? content : [];
  const texts = blocks.flatMap((block) => _.isObject(block) && 'type' in block && block.type === 'text' && 'text' in block
    ? [String(block.text)]
    : []);

  return blocks.length && texts.length === blocks.length ? texts.join('\n') : content ?? '';
};

/** Collects stream parts into the result of `doGenerate` */
export const collectStream = async (stream: ReadableStream<TLlmStreamPart>): Promise<TLlmGenerateResult> => {
  const result: TLlmGenerateResult = {
    content: [],
    warnings: [],

    finishReason: { unified: 'other', raw: undefined },
    usage: compileEmptyUsage(),
  };

  const reader = stream.getReader();

  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    const part = chunk.value;

    switch (part.type) {
      case 'stream-start': result.warnings.push(...part.warnings); continue;
      case 'text-delta': result.content.push({ type: 'text', text: part.delta }); continue;
      case 'reasoning-delta': result.content.push({ type: 'reasoning', text: part.delta }); continue;
      case 'tool-call': result.content.push(part); continue;
      case 'tool-result': result.content.push(part); continue;
      case 'error': throw part.error;

      case 'finish': {
        Object.assign(result, {
          finishReason: part.finishReason,
          usage: part.usage,
          providerMetadata: part.providerMetadata,
        });

        continue;
      }
    }
  }

  return result;
};
