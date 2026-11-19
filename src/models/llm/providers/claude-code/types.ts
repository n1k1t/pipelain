import type { LanguageModel } from 'ai';

export type TLlmClaudeCodeModel = Extract<LanguageModel, { specificationVersion: 'v4' }>;
export type TLlmClaudeCodeCallOptions = Parameters<TLlmClaudeCodeModel['doStream']>[0];

export type TLlmClaudeCodeStreamResult = Awaited<ReturnType<TLlmClaudeCodeModel['doStream']>>;
export type TLlmClaudeCodeGenerateResult = Awaited<ReturnType<TLlmClaudeCodeModel['doGenerate']>>;

export type TLlmClaudeCodeStreamPart = TLlmClaudeCodeStreamResult['stream'] extends ReadableStream<infer T> ? T : never;
export type TLlmClaudeCodeFinishPart = Extract<TLlmClaudeCodeStreamPart, { type: 'finish' }>;
export type TLlmClaudeCodeWarning = Extract<TLlmClaudeCodeStreamPart, { type: 'stream-start' }>['warnings'][number];
export type TLlmClaudeCodeFunctionTool = Extract<NonNullable<TLlmClaudeCodeCallOptions['tools']>[number], { type: 'function' }>;

export type TLlmClaudeCodePermissionMode = 'acceptEdits' | 'auto' | 'bypassPermissions' | 'manual' | 'dontAsk' | 'plan';
export type TLlmClaudeCodeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * Kind of the connection key
 * - `oauth`: Claude subscription token from `claude setup-token` (`CLAUDE_CODE_OAUTH_TOKEN`)
 * - `api-key`: Anthropic API key (`ANTHROPIC_API_KEY`)
 * - `bearer`: Bearer token of a proxy or gateway (`ANTHROPIC_AUTH_TOKEN`)
 */
export type TLlmClaudeCodeAuth = 'oauth' | 'api-key' | 'bearer';

/** Content block of a Claude Code CLI message */
export type TLlmClaudeCodeBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean };

/** Final event of a Claude Code CLI session (`--output-format stream-json`) */
export interface ILlmClaudeCodeResultEvent {
  type: 'result';
  subtype: string;
  is_error: boolean;

  result?: string;
  structured_output?: unknown;
  errors?: string[];

  session_id: string;
  stop_reason?: string;
  total_cost_usd?: number;
  num_turns?: number;

  usage?: {
    input_tokens?: number;
    output_tokens?: number;

    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;

    output_tokens_details?: { thinking_tokens?: number };
  };
}

/** Event of a Claude Code CLI session (`--output-format stream-json`) */
export type TLlmClaudeCodeEvent =
  | { type: 'system'; subtype: string; session_id?: string; model?: string }
  | { type: 'assistant'; message: { id: string; content: TLlmClaudeCodeBlock[] } }
  | { type: 'user'; message: { content: string | TLlmClaudeCodeBlock[] } }
  | ILlmClaudeCodeResultEvent;

/** JSON-RPC message of MCP client (request or notification without `id`) */
export interface ILlmClaudeCodeJsonRpcMessage {
  jsonrpc: '2.0';
  method: string;

  id?: string | number | null;
  params?: Record<string, unknown>;
}

/** JSON-RPC answer of the bridge without `jsonrpc` and `id` */
export type TLlmClaudeCodeJsonRpcAnswer =
  | { result: object }
  | { error: { code: number; message: string } };

/** MCP tool result of the bridge */
export interface ILlmClaudeCodeBridgeToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export interface ILlmClaudeCodeOptions {
  /** Path to the Claude Code executable (default `claude`) */
  executable?: string;

  /** Working directory of the Claude Code session (default `process.cwd()`) */
  cwd?: string;

  /** Environment variables of the Claude Code process (default `process.env`) */
  env?: Record<string, string | undefined>;

  /**
   * Kind of the connection key to pass into the matched environment variable (default `oauth`)
   * Without the connection key (or with `none`) Claude Code uses the local login
   */
  auth?: TLlmClaudeCodeAuth;

  /** Built-in Claude Code tools like `Read`, `Bash` or `default` (default `[]`, all the tools are disabled) */
  tools?: string[];

  /** Tools which are allowed without a permission prompt */
  allowedTools?: string[];

  /** Tools which are removed from the model context */
  disallowedTools?: string[];

  /** Permission mode of the Claude Code session */
  permissionMode?: TLlmClaudeCodePermissionMode;

  /** MCP configs (paths to JSON files or JSON strings). Only these MCP servers are loaded */
  mcp?: string[];

  /** Replaces the default Claude Code system prompt or appends to it (default `replace`) */
  system?: 'replace' | 'append';

  /** Maximum dollar amount to spend on API calls */
  budget?: number;

  /** Additional CLI arguments */
  args?: string[];
}
