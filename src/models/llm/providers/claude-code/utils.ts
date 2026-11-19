import _ from 'lodash';

import type { ServerResponse } from 'node:http';
import type { ILlmProviderConnection } from '../model';
import type {
  ILlmClaudeCodeJsonRpcMessage,
  ILlmClaudeCodeOptions,
  ILlmClaudeCodeResultEvent,
  TLlmClaudeCodeAuth,
  TLlmClaudeCodeCallOptions,
  TLlmClaudeCodeEffort,
  TLlmClaudeCodeEvent,
  TLlmClaudeCodeFinishPart,
  TLlmClaudeCodeStreamPart,
  TLlmClaudeCodeWarning,
} from './types';

/** Name of the MCP server which bridges pipeline tools into Claude Code */
export const BRIDGE_NAME = 'pipelain';

/** Prefix of the bridged pipeline tools in Claude Code */
export const BRIDGE_PREFIX = `mcp__${BRIDGE_NAME}__`;

const AUTH_ENV_VARIABLES = {
  'oauth': 'CLAUDE_CODE_OAUTH_TOKEN',
  'api-key': 'ANTHROPIC_API_KEY',
  'bearer': 'ANTHROPIC_AUTH_TOKEN',
} satisfies Record<TLlmClaudeCodeAuth, string>;

/**
 * Compiles environment variables of the Claude Code process
 * The connection key is passed into the variable of `auth` option (other auth variables are removed to avoid conflicts)
 * The connection URL is passed into `ANTHROPIC_BASE_URL`
 */
export const compileEnv = (
  options: ILlmClaudeCodeOptions,
  connection?: ILlmProviderConnection
): Record<string, string | undefined> => {
  const env = options.env ?? process.env;
  const key = connection?.key && connection.key !== 'none' ? connection.key : undefined;

  return {
    ...(key ? _.omit(env, Object.values(AUTH_ENV_VARIABLES)) : env),

    ...(key && { [AUTH_ENV_VARIABLES[options.auth ?? 'oauth']]: key }),
    ...(connection?.url && { ANTHROPIC_BASE_URL: connection.url }),
  };
};

/** Splits the prompt into the system prompt and the user message (history is rendered as a transcript) */
export const compilePrompt = (prompt: TLlmClaudeCodeCallOptions['prompt']): {
  system?: string;
  user: string;
  warnings: TLlmClaudeCodeWarning[];
} => {
  const warnings: TLlmClaudeCodeWarning[] = [];
  const system = prompt.flatMap((message) => message.role === 'system' ? [message.content] : []);
  const messages = prompt.filter((message) => message.role !== 'system');

  const render = (message: (typeof messages)[number]): string => message.content
    .map((part) => {
      switch (part.type) {
        case 'text': return part.text;
        case 'tool-call': return `[tool call ${part.toolName}] ${JSON.stringify(part.input)}`;
        case 'tool-result': return `[tool result ${part.toolName}] ${JSON.stringify(part.output)}`;

        case 'file': {
          warnings.push({ type: 'unsupported', feature: 'file', details: 'Files are not passed to Claude Code CLI' });
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
 * Compiles JSON schema for `--json-schema` (Claude Code accepts only `object` root)
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

/** Collects warnings about call options which are not supported by Claude Code CLI */
export const collectWarnings = (options: TLlmClaudeCodeCallOptions, bridged: string[] = []): TLlmClaudeCodeWarning[] => {
  const unsupported = <const>['temperature', 'topP', 'topK', 'seed', 'stopSequences', 'presencePenalty', 'frequencyPenalty'];
  const skipped = (options.tools ?? []).filter((tool) => !bridged.includes(tool.name));

  return [
    ...unsupported
      .filter((feature) => options[feature] !== undefined)
      .map((feature): TLlmClaudeCodeWarning => ({ type: 'unsupported', feature })),

    ...(skipped.length
      ? [<TLlmClaudeCodeWarning>{
        type: 'unsupported',
        feature: 'tools',
        details: `Tools [${skipped.map((tool) => tool.name).join(', ')}] are not executable and are not passed to Claude Code CLI`,
      }]
      : []),
  ];
};

/** Converts Claude Code tool name (bridged pipeline tools lose the MCP prefix, other tools are dynamic) */
export const convertToolName = (name: string): { name: string; dynamic: boolean } => name.startsWith(BRIDGE_PREFIX)
  ? { name: name.slice(BRIDGE_PREFIX.length), dynamic: false }
  : { name, dynamic: true };

/** Converts content of Claude Code tool result (text blocks of MCP result are joined) */
export const convertToolResult = (content: unknown): unknown => {
  const blocks = Array.isArray(content) ? content : [];
  const texts = blocks.flatMap((block) => _.isObject(block) && 'type' in block && block.type === 'text' && 'text' in block
    ? [String(block.text)]
    : []);

  return blocks.length && texts.length === blocks.length ? texts.join('\n') : content ?? '';
};

/**
 * Converts Claude Code CLI event into stream parts
 * All the tools are marked as provider executed (Claude Code or the bridge executes them)
 */
export const convertEvent = (event: TLlmClaudeCodeEvent, tools: Map<string, string>): TLlmClaudeCodeStreamPart[] => {
  if (event.type === 'system' && event.subtype === 'init') {
    return [{
      type: 'response-metadata',

      id: event.session_id,
      modelId: event.model,
      timestamp: new Date(),
    }];
  }

  if (event.type === 'assistant') {
    return event.message.content.flatMap((block, index): TLlmClaudeCodeStreamPart[] => {
      const id = `${event.message.id}:${index}`;

      if (block.type === 'thinking' && block.thinking.length) {
        return [
          { type: 'reasoning-start', id },
          { type: 'reasoning-delta', id, delta: block.thinking },
          { type: 'reasoning-end', id },
        ];
      }
      if (block.type === 'tool_use' && block.name !== 'StructuredOutput') {
        const tool = convertToolName(block.name);
        tools.set(block.id, block.name);

        return [{
          type: 'tool-call',

          toolCallId: block.id,
          toolName: tool.name,
          input: JSON.stringify(block.input ?? {}),

          providerExecuted: true,
          ...(tool.dynamic && { dynamic: true }),
        }];
      }

      return [];
    });
  }

  if (event.type === 'user' && Array.isArray(event.message.content)) {
    return event.message.content.flatMap((block): TLlmClaudeCodeStreamPart[] => {
      const name = block.type === 'tool_result' ? tools.get(block.tool_use_id) : undefined;

      if (block.type !== 'tool_result' || !name) {
        return [];
      }

      const tool = convertToolName(name);

      return [{
        type: 'tool-result',

        toolCallId: block.tool_use_id,
        toolName: tool.name,
        result: <NonNullable<Extract<TLlmClaudeCodeStreamPart, { type: 'tool-result' }>['result']>>convertToolResult(block.content),

        isError: block.is_error ?? false,
        ...(tool.dynamic && { dynamic: true }),
      }];
    });
  }

  return [];
};

export const convertUsage = (usage?: ILlmClaudeCodeResultEvent['usage']): TLlmClaudeCodeFinishPart['usage'] => {
  const input = {
    noCache: usage?.input_tokens ?? 0,
    cacheRead: usage?.cache_read_input_tokens ?? 0,
    cacheWrite: usage?.cache_creation_input_tokens ?? 0,
  };

  return {
    inputTokens: {
      ...input,
      total: input.noCache + input.cacheRead + input.cacheWrite,
    },

    outputTokens: {
      total: usage?.output_tokens ?? 0,
      text: undefined,
      reasoning: usage?.output_tokens_details?.thinking_tokens,
    },
  };
};

export const convertResult = (result: ILlmClaudeCodeResultEvent): TLlmClaudeCodeFinishPart => ({
  type: 'finish',

  finishReason: { unified: 'stop', raw: result.stop_reason ?? result.subtype },
  usage: convertUsage(result.usage),

  providerMetadata: {
    'claude-code': {
      sessionId: result.session_id,
      turns: result.num_turns ?? null,
      cost: result.total_cost_usd ?? null,
    },
  },
});

/** Converts AI SDK reasoning into Claude Code effort level */
export const convertReasoning = (
  reasoning?: TLlmClaudeCodeCallOptions['reasoning'] | 'max'
): TLlmClaudeCodeEffort | undefined => {
  switch (reasoning) {
    case 'none':
    case 'minimal':
    case 'low': return 'low';

    case 'medium':
    case 'high':
    case 'xhigh':
    case 'max': return reasoning;

    default: return undefined;
  }
};

/** Awaits tool output (the last value of a streamed output is used) */
export const consumeToolOutput = async (output: unknown): Promise<unknown> => {
  if (!_.isObject(output) || !(Symbol.asyncIterator in output)) {
    return output;
  }

  let last: unknown;

  for await (const value of <AsyncIterable<unknown>>output) {
    last = value;
  }

  return last;
};

/** Writes HTTP answer of the bridge (body is serialized into JSON) */
export const reply = (response: ServerResponse, code: number, body?: object): void => {
  if (!body) {
    return void response.writeHead(code).end();
  }

  response.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
};

export const isJsonRpcMessage = (value: unknown): value is ILlmClaudeCodeJsonRpcMessage =>
  _.isObject(value) && 'method' in value && typeof value.method === 'string';
