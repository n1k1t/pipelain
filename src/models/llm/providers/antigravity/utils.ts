import _ from 'lodash';

import type { TLlmCallOptions, TLlmFinishPart, TLlmStreamPart } from '../../types';
import type { ILlmProviderConnection } from '../model';
import type {
  ILlmAntigravityOptions,
  ILlmAntigravityResult,
  ILlmAntigravityUsage,
  TLlmAntigravityEffort,
  TLlmAntigravityEvent,
} from './types';

import { LLM_BRIDGE_NAME, LlmBridge } from '../../bridge';

/** Prefix of the bridged pipeline tools in Antigravity (eager MCP tools are named `mcp_<server>_<tool>`) */
export const BRIDGE_PREFIX = `mcp_${LLM_BRIDGE_NAME}_`;

/** Name of the custom agent which runs pipeline prompts */
export const AGENT_NAME = LLM_BRIDGE_NAME;

/** Header lines which Antigravity prepends to MCP tool outputs */
const TOOL_OUTPUT_HEADER = /^(Created At|Completed At): .*\n/gm;

type TLlmAntigravityToolResultPart = Extract<TLlmStreamPart, { type: 'tool-result' }>;

/**
 * Compiles environment variables of the Antigravity CLI process
 * The connection key is passed into `GEMINI_API_KEY` (used with `gemini` model provider)
 */
export const compileEnv = (
  options: ILlmAntigravityOptions,
  connection?: ILlmProviderConnection
): Record<string, string | undefined> => {
  const key = connection?.key && connection.key !== 'none' ? connection.key : undefined;

  return {
    ...(options.env ?? process.env),
    ...(key && { GEMINI_API_KEY: key }),
  };
};

/**
 * Compiles session settings (`--settings`)
 * Non-workspace files are accessible, with the connection key the session uses Gemini API as model provider instead of the local login
 */
export const compileSettings = (
  options: ILlmAntigravityOptions,
  connection?: ILlmProviderConnection
): Record<string, unknown> => ({
  allowNonWorkspaceAccess: true,

  ...(connection?.key && connection.key !== 'none' && { modelProvider: 'gemini' }),
  ...options.settings,
});

/**
 * Compiles Markdown definition of the custom agent (`.agents/agents/<name>/agent.md`)
 * The agent excludes default prompt sections and built-in tools: only built-in tools from options and MCP tools are available
 * The system prompt of the call becomes the agent instructions
 * Structured output requires `finish` tool (Antigravity forces the agent to call it with the output)
 */
export const compileAgent = (
  options: ILlmAntigravityOptions,
  provided: { system?: string; structured?: boolean } = {}
): string => [
  '---',
  `name: ${AGENT_NAME}`,
  'description: Agent which runs pipelain pipeline prompts',
  'excludeDefaultComponents: true',
  `tools: ${JSON.stringify(_.uniq([...(options.tools ?? []), ...(provided.structured ? ['finish'] : [])]))}`,
  '---',
  '# Instructions',
  '',
  provided.system || 'Follow the user instructions',
  '',
].join('\n');

/** Compiles MCP config of the bridge for `.agents/mcp_config.json` (tools are eager to be registered as `mcp_<server>_<tool>`) */
export const compileMcpConfig = (bridge: LlmBridge): object => ({
  mcpServers: {
    [bridge.name]: {
      url: bridge.url,
      headers: { Authorization: `Bearer ${bridge.token}` },
      tools: _.mapValues(bridge.tools, () => ({ eager: true })),
    },
  },
});

/** Converts Antigravity tool name (bridged pipeline tools lose the MCP prefix, other tools are dynamic) */
export const convertToolName = (name: string): { name: string; dynamic: boolean } => name.startsWith(BRIDGE_PREFIX)
  ? { name: name.slice(BRIDGE_PREFIX.length), dynamic: false }
  : { name, dynamic: true };

/**
 * Converts Antigravity CLI event into stream parts
 * Tool steps are converted into tool calls on the first sight and into tool results when they are finished
 * All the tools are marked as provider executed (Antigravity or the bridge executes them)
 */
export const convertEvent = (event: TLlmAntigravityEvent, called: Set<string>): TLlmStreamPart[] => {
  if (event.event === 'init') {
    return [{
      type: 'response-metadata',

      timestamp: new Date(),
      ...(event.conversation_id && { id: event.conversation_id }),
      ...(event.init.model && { modelId: event.init.model }),
    }];
  }

  if (event.event !== 'step_update' || event.step_update.step_type !== 'tool') {
    return [];
  }

  const step = event.step_update;
  const id = `${step.conversation_id}:${step.step_index}`;
  const tool = convertToolName(step.tool_info?.name ?? step.tool_name ?? 'unknown');

  const parts: TLlmStreamPart[] = [];

  if (!called.has(id)) {
    called.add(id);
    parts.push({
      type: 'tool-call',

      toolCallId: id,
      toolName: tool.name,
      input: JSON.stringify(step.tool_info?.parameters ?? {}),

      providerExecuted: true,
      ...(tool.dynamic && { dynamic: true }),
    });
  }

  if (step.state === 'DONE' || step.state === 'ERROR') {
    const error = step.tool_info?.error;

    parts.push({
      type: 'tool-result',

      toolCallId: id,
      toolName: tool.name,
      result: <NonNullable<TLlmAntigravityToolResultPart['result']>>(
        error
          ? error.message ?? error.type ?? 'Tool is failed'
          : (step.tool_info?.output ?? '').replace(TOOL_OUTPUT_HEADER, '')
      ),

      isError: step.state === 'ERROR' || Boolean(error),
      ...(tool.dynamic && { dynamic: true }),
    });
  }

  return parts;
};

/** Converts Antigravity usage (input tokens exclude cache reads, output tokens include thinking) */
export const convertUsage = (usage?: ILlmAntigravityUsage): TLlmFinishPart['usage'] => {
  const input = {
    noCache: usage?.input_tokens ?? 0,
    cacheRead: usage?.cache_read_tokens ?? 0,
    cacheWrite: 0,
  };

  return {
    inputTokens: {
      ...input,
      total: input.noCache + input.cacheRead,
    },

    outputTokens: {
      total: usage?.output_tokens ?? 0,
      text: undefined,
      reasoning: usage?.thinking_tokens,
    },
  };
};

export const convertFinish = (result: ILlmAntigravityResult): TLlmFinishPart => ({
  type: 'finish',

  finishReason: { unified: 'stop', raw: result.status },
  usage: convertUsage(result.usage),

  providerMetadata: {
    antigravity: {
      conversationId: result.conversation_id,
      turns: result.num_turns ?? null,
      duration: result.duration_seconds ?? null,
    },
  },
});

/** Converts AI SDK reasoning into Antigravity effort level */
export const convertReasoning = (
  reasoning?: TLlmCallOptions['reasoning'] | 'max'
): TLlmAntigravityEffort | undefined => {
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

/** Converts result error of Antigravity CLI into a reason message */
export const convertError = (result: ILlmAntigravityResult): string => {
  if (typeof result.error === 'string' && result.error.length) {
    return result.error;
  }
  if (_.isPlainObject(result.error) && typeof (<{ message?: unknown }>result.error).message === 'string') {
    return (<{ message: string }>result.error).message;
  }

  return result.error ? JSON.stringify(result.error) : `Got result [${result.status}]`;
};
