/** Built-in Codex tool */
export type TLlmCodexTool = 'shell' | 'web_search' | 'view_image' | 'image_generation';

/** Reasoning effort of Codex models */
export type TLlmCodexEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Item of a Codex thread (`codex exec --json`) */
export interface ILlmCodexItem {
  id: string;
  type: string;

  /** Text of `agent_message` and `reasoning` items */
  text?: string;

  /** Fields of `command_execution` items */
  command?: string;
  aggregated_output?: string;
  exit_code?: number | null;

  /** Fields of `file_change` items */
  changes?: unknown[];

  /** Fields of `mcp_tool_call` items */
  server?: string;
  tool?: string;
  arguments?: unknown;
  result?: unknown;
  error?: unknown;

  /** Fields of `web_search` items */
  query?: string;

  status?: string;
}

/** Usage of a Codex turn */
export interface ILlmCodexUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
}

/** Event of a Codex session (`codex exec --json`) */
export type TLlmCodexEvent =
  | { type: 'thread.started'; thread_id: string }
  | { type: 'turn.started' }
  | { type: 'turn.completed'; usage?: ILlmCodexUsage }
  | { type: 'turn.failed'; error?: { message?: string } }
  | { type: 'item.started' | 'item.updated' | 'item.completed'; item: ILlmCodexItem }
  | { type: 'error'; message?: string };

export interface ILlmCodexOptions {
  /** Path to the Codex executable (default `codex`) */
  executable?: string;

  /** Environment variables of the Codex process (default `process.env`) */
  env?: Record<string, string | undefined>;

  /**
   * Built-in Codex tools (default `[]`, all the tools are disabled)
   * The session runs without sandbox and approvals, so enabled `shell` has full access to the system
   */
  tools?: (TLlmCodexTool | (string & {}))[];

  /** Config overrides (`-c key=value`), nested objects are flattened into dotted keys */
  config?: Record<string, unknown>;

  /** Additional CLI arguments */
  args?: string[];
}
