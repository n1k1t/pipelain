import _ from 'lodash';

import type { ILlmProviderConnection } from '../model';
import type {
  ILlmClaudeCodeOptions,
  ILlmClaudeCodeResultEvent,
  TLlmClaudeCodeAuth,
  TLlmClaudeCodeCallOptions,
  TLlmClaudeCodeEffort,
  TLlmClaudeCodeEvent,
  TLlmClaudeCodeFinishPart,
  TLlmClaudeCodeStreamPart,
} from './types';

import { LLM_BRIDGE_NAME, LlmBridge } from '../../bridge';
import { convertToolContent } from '../../utils';

/** Prefix of the bridged pipeline tools in Claude Code */
export const BRIDGE_PREFIX = `mcp__${LLM_BRIDGE_NAME}__`;

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

/** Converts Claude Code tool name (bridged pipeline tools lose the MCP prefix, other tools are dynamic) */
export const convertToolName = (name: string): { name: string; dynamic: boolean } => name.startsWith(BRIDGE_PREFIX)
  ? { name: name.slice(BRIDGE_PREFIX.length), dynamic: false }
  : { name, dynamic: true };

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
        result: <NonNullable<Extract<TLlmClaudeCodeStreamPart, { type: 'tool-result' }>['result']>>convertToolContent(block.content),

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

/** Compiles MCP config of the bridge for `--mcp-config` */
export const compileMcpConfig = (bridge: LlmBridge): object => ({
  mcpServers: {
    [bridge.name]: {
      type: 'http',
      url: bridge.url,
      headers: { Authorization: `Bearer ${bridge.token}` },
    },
  },
});
