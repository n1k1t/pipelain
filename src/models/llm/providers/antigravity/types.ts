/** Built-in Antigravity tool (tool names of newer Antigravity versions are accepted as strings) */
export type TLlmAntigravityTool =
  | 'run_command'
  | 'command_status'
  | 'send_command_input'
  | 'view_file'
  | 'list_dir'
  | 'find_by_name'
  | 'grep_search'
  | 'write_to_file'
  | 'replace_file_content'
  | 'multi_replace_file_content'
  | 'read_url_content'
  | 'search_web'
  | 'generate_image';

/** Reasoning effort of Antigravity CLI session (`--effort`) */
export type TLlmAntigravityEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Usage of an Antigravity CLI step or session */
export interface ILlmAntigravityUsage {
  input_tokens?: number;
  output_tokens?: number;
  thinking_tokens?: number;
  cache_read_tokens?: number;
  total_tokens?: number;
}

/** Tool details of an Antigravity CLI step */
export interface ILlmAntigravityToolInfo {
  name: string;
  parameters?: unknown;

  output?: string;
  error?: { type?: string; message?: string };
}

/** Step update of an Antigravity CLI session */
export interface ILlmAntigravityStep {
  conversation_id: string;
  step_index: number;

  state: 'ACTIVE' | 'DONE' | 'ERROR' | (string & {});
  step_type: 'user_input' | 'agent_response' | 'tool' | 'checkpoint' | 'finish' | (string & {});

  tool_name?: string;
  tool_info?: ILlmAntigravityToolInfo;

  text_delta?: string;
  usage?: ILlmAntigravityUsage;
}

/** Final result of an Antigravity CLI session */
export interface ILlmAntigravityResult {
  conversation_id: string;
  status: 'SUCCESS' | 'ERROR' | 'CANCELED' | 'INTERRUPTED' | 'INVALID' | 'WAITING' | 'RUNNING' | (string & {});

  response?: string;
  error?: unknown;
  structured_output?: unknown;

  num_turns?: number;
  duration_seconds?: number;
  usage?: ILlmAntigravityUsage;
}

/** Event of an Antigravity CLI session (`--output-format stream-json`) */
export type TLlmAntigravityEvent =
  | { event: 'init'; conversation_id?: string; init: { model?: string; cwd?: string; tools?: string[]; permission_mode?: string } }
  | { event: 'step_update'; step_update: ILlmAntigravityStep }
  | { event: 'result'; result: ILlmAntigravityResult };

export interface ILlmAntigravityOptions {
  /** Path to the Antigravity CLI executable (default `agy`) */
  executable?: string;

  /** Environment variables of the Antigravity CLI process (default `process.env`) */
  env?: Record<string, string | undefined>;

  /**
   * Built-in Antigravity tools (default `[]`, all the tools are disabled)
   * The session runs as a custom agent without default tools and auto-approves all the tool calls (`--dangerously-skip-permissions`),
   * so enabled `run_command` has full access to the system
   */
  tools?: (TLlmAntigravityTool | (string & {}))[];

  /** Session settings overrides (`--settings`), merged over the compiled ones */
  settings?: Record<string, unknown>;

  /** Additional CLI arguments */
  args?: string[];
}
