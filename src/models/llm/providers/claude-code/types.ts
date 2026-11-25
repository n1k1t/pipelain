import type {
  TLlmCallOptions,
  TLlmFinishPart,
  TLlmGenerateResult,
  TLlmLanguageModel,
  TLlmStreamPart,
  TLlmStreamResult,
  TLlmWarning,
} from '../../types';

export type TLlmClaudeCodeModel = TLlmLanguageModel;
export type TLlmClaudeCodeCallOptions = TLlmCallOptions;

export type TLlmClaudeCodeStreamResult = TLlmStreamResult;
export type TLlmClaudeCodeGenerateResult = TLlmGenerateResult;

export type TLlmClaudeCodeStreamPart = TLlmStreamPart;
export type TLlmClaudeCodeFinishPart = TLlmFinishPart;
export type TLlmClaudeCodeWarning = TLlmWarning;

export type TLlmClaudeCodeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Built-in Claude Code tool (tool names of newer Claude Code versions are accepted as strings) */
export type TLlmClaudeCodeTool =
  | 'Bash'
  | 'Edit'
  | 'Glob'
  | 'Grep'
  | 'NotebookEdit'
  | 'Read'
  | 'TodoWrite'
  | 'WebFetch'
  | 'WebSearch'
  | 'Write';

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

export interface ILlmClaudeCodeOptions {
  /** Path to the Claude Code executable (default `claude`) */
  executable?: string;

  /** Environment variables of the Claude Code process (default `process.env`) */
  env?: Record<string, string | undefined>;

  /**
   * Kind of the connection key to pass into the matched environment variable (default `oauth`)
   * Without the connection key (or with `none`) Claude Code uses the local login
   */
  auth?: TLlmClaudeCodeAuth;

  /**
   * Built-in Claude Code tools (default `[]`, all the tools are disabled)
   * The session runs in `dontAsk` permission mode, so only these tools and pipeline tools are allowed
   */
  tools?: (TLlmClaudeCodeTool | (string & {}))[];

  /** Replaces the default Claude Code system prompt or appends to it (default `replace`) */
  system?: 'replace' | 'append';

  /** Maximum dollar amount to spend on API calls */
  budget?: number;

  /** Additional CLI arguments */
  args?: string[];
}
