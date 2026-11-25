import _ from 'lodash';

import type { TLlmCallOptions, TLlmFinishPart, TLlmStreamPart } from '../../types';
import type { ILlmProviderConnection } from '../model';
import type {
  ILlmCodexItem,
  ILlmCodexOptions,
  ILlmCodexUsage,
  TLlmCodexEffort,
  TLlmCodexEvent,
  TLlmCodexTool,
} from './types';

import { LLM_BRIDGE_NAME, LlmBridge } from '../../bridge';
import { convertToolContent } from '../../utils';

/** Environment variable which passes the bridge token into Codex (tokens in CLI arguments are visible to other processes) */
export const BRIDGE_TOKEN_ENV_VARIABLE = 'PIPELAIN_BRIDGE_TOKEN';

/** JSON schema keywords which are not supported by OpenAI strict structured outputs */
const UNSUPPORTED_SCHEMA_KEYWORDS = ['format', 'pattern'];

type TLlmCodexToolResultPart = Extract<TLlmStreamPart, { type: 'tool-result' }>;

/**
 * Compiles environment variables of the Codex process
 * The connection key is passed into `CODEX_API_KEY` and the connection URL is passed into `OPENAI_BASE_URL`
 */
export const compileEnv = (
  options: ILlmCodexOptions,
  connection?: ILlmProviderConnection,
  bridge?: LlmBridge
): Record<string, string | undefined> => {
  const key = connection?.key && connection.key !== 'none' ? connection.key : undefined;

  return {
    ...(options.env ?? process.env),

    ...(key && { CODEX_API_KEY: key }),
    ...(connection?.url && { OPENAI_BASE_URL: connection.url }),
    ...(bridge && { [BRIDGE_TOKEN_ENV_VARIABLE]: bridge.token }),
  };
};

/** Compiles config overrides into `-c key=value` arguments (nested objects are flattened into dotted keys) */
export const compileConfig = (config: Record<string, unknown>, prefix?: string): string[] => Object
  .entries(config)
  .flatMap(([name, value]) => {
    const key = prefix ? `${prefix}.${name}` : name;

    return _.isPlainObject(value)
      ? compileConfig(<Record<string, unknown>>value, key)
      : ['-c', `${key}=${JSON.stringify(value)}`];
  });

/** Config keys which switch built-in Codex tools */
const TOOL_CONFIG_KEYS = {
  shell: 'features.shell_tool',
  web_search: 'tools.web_search',
  view_image: 'features.view_image',
  image_generation: 'features.image_generation',
} satisfies Record<TLlmCodexTool, string>;

/** Compiles config which enables listed built-in tools and disables others */
export const compileToolsConfig = (tools: string[] = []): Record<string, unknown> => _.mapValues(
  _.invert(TOOL_CONFIG_KEYS),
  (tool) => tools.includes(<TLlmCodexTool>tool)
);

/** Compiles config of the bridge MCP server (the token is read from the environment variable) */
export const compileBridgeConfig = (bridge: LlmBridge): Record<string, unknown> => ({
  mcp_servers: {
    [bridge.name]: {
      url: bridge.url,
      bearer_token_env_var: BRIDGE_TOKEN_ENV_VARIABLE,
    },
  },
});

/** Removes JSON schema keywords which are not supported by OpenAI strict structured outputs */
export const sanitizeSchema = (schema: unknown): unknown => {
  if (Array.isArray(schema)) {
    return schema.map(sanitizeSchema);
  }
  if (!_.isPlainObject(schema)) {
    return schema;
  }

  return Object
    .entries(<Record<string, unknown>>schema)
    .filter(([key]) => !UNSUPPORTED_SCHEMA_KEYWORDS.includes(key))
    .reduce<Record<string, unknown>>((acc, [key, value]) => _.set(acc, [key], key === 'properties'
      ? _.mapValues(<Record<string, unknown>>value, sanitizeSchema)
      : sanitizeSchema(value)
    ), {});
};

/** Converts AI SDK reasoning into Codex effort level */
export const convertReasoning = (reasoning?: TLlmCallOptions['reasoning'] | 'max'): TLlmCodexEffort | undefined =>
  reasoning && reasoning !== 'provider-default' ? reasoning : undefined;

/** Converts Codex tool item into tool call (bridged pipeline tools are not dynamic) */
export const convertTool = (item: ILlmCodexItem): { name: string; input: unknown; dynamic: boolean } | undefined => {
  switch (item.type) {
    case 'command_execution': return { name: 'exec', input: { command: item.command }, dynamic: true };
    case 'file_change': return { name: 'patch', input: { changes: item.changes }, dynamic: true };
    case 'web_search': return { name: 'web_search', input: { query: item.query }, dynamic: true };

    case 'mcp_tool_call': return item.server === LLM_BRIDGE_NAME
      ? { name: String(item.tool), input: item.arguments ?? {}, dynamic: false }
      : { name: `${item.server}.${item.tool}`, input: item.arguments ?? {}, dynamic: true };

    default: return undefined;
  }
};

/** Converts completed Codex tool item into tool result */
export const convertToolResult = (item: ILlmCodexItem): Pick<TLlmCodexToolResultPart, 'result' | 'isError'> => {
  const failed = item.status === 'failed';

  switch (item.type) {
    case 'command_execution': return {
      result: item.aggregated_output ?? '',
      isError: failed || (typeof item.exit_code === 'number' && item.exit_code !== 0),
    };

    case 'mcp_tool_call': {
      const result = _.isObject(item.result) && 'content' in item.result ? item.result.content : item.result;
      const error = _.isObject(item.error) && 'message' in item.error ? item.error.message : item.error;

      return {
        result: <TLlmCodexToolResultPart['result']>convertToolContent(error ?? result),
        isError: failed || Boolean(error) || (_.isObject(item.result) && 'isError' in item.result && item.result.isError === true),
      };
    }

    default: return {
      result: <TLlmCodexToolResultPart['result']>(item.changes ?? item.query ?? item.status ?? ''),
      isError: failed,
    };
  }
};

/**
 * Converts Codex CLI event into stream parts
 * Tools are emitted as provider executed calls (Codex or the bridge executes them), a call is emitted on the first item event
 */
export const convertEvent = (event: TLlmCodexEvent, called: Set<string>): TLlmStreamPart[] => {
  if (event.type === 'thread.started') {
    return [{ type: 'response-metadata', id: event.thread_id, timestamp: new Date() }];
  }
  if (event.type !== 'item.started' && event.type !== 'item.updated' && event.type !== 'item.completed') {
    return [];
  }

  const item = event.item;

  if (item.type === 'reasoning') {
    return event.type === 'item.completed' && item.text?.length
      ? [
        { type: 'reasoning-start', id: item.id },
        { type: 'reasoning-delta', id: item.id, delta: item.text },
        { type: 'reasoning-end', id: item.id },
      ]
      : [];
  }

  const tool = convertTool(item);
  if (!tool) {
    return [];
  }

  const parts: TLlmStreamPart[] = [];

  if (!called.has(item.id)) {
    called.add(item.id);

    parts.push({
      type: 'tool-call',

      toolCallId: item.id,
      toolName: tool.name,
      input: JSON.stringify(tool.input),

      providerExecuted: true,
      ...(tool.dynamic && { dynamic: true }),
    });
  }

  if (event.type === 'item.completed') {
    parts.push({
      type: 'tool-result',

      toolCallId: item.id,
      toolName: tool.name,

      ...convertToolResult(item),
      ...(tool.dynamic && { dynamic: true }),
    });
  }

  return parts;
};

export const convertUsage = (usage?: ILlmCodexUsage): TLlmFinishPart['usage'] => {
  const total = usage?.input_tokens ?? 0;
  const cached = usage?.cached_input_tokens ?? 0;

  return {
    inputTokens: {
      total,
      noCache: Math.max(0, total - cached),
      cacheRead: cached,
      cacheWrite: undefined,
    },

    outputTokens: {
      total: usage?.output_tokens ?? 0,
      text: undefined,
      reasoning: usage?.reasoning_output_tokens,
    },
  };
};

export const convertFinish = (provided: { thread?: string; usage?: ILlmCodexUsage }): TLlmFinishPart => ({
  type: 'finish',

  finishReason: { unified: 'stop', raw: 'turn.completed' },
  usage: convertUsage(provided.usage),

  providerMetadata: {
    codex: { threadId: provided.thread ?? null },
  },
});
