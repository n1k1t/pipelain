import { APICallError } from 'ai';

export interface ILlmClaudeCodeErrorDetails {
  /** CLI arguments of the failed call */
  args?: string[];

  /** Raw result event of the Claude Code CLI */
  body?: string;

  cause?: unknown;
}

/** Error of the Claude Code CLI call (extends `APICallError` to be handled by pipeline steps as `BAD_API_CALL`) */
export class LlmClaudeCodeError extends APICallError {
  constructor(public executable: string, reason: string, details: ILlmClaudeCodeErrorDetails = {}) {
    super({
      message: `Cannot use Claude Code CLI [${executable}]: ${reason}`,
      url: `cli://${executable}`,

      requestBodyValues: { args: details.args ?? [] },
      responseBody: details.body,

      isRetryable: false,
      cause: details.cause,
    });
  }

  static build(executable: string, reason: string, details?: ILlmClaudeCodeErrorDetails): LlmClaudeCodeError {
    return new LlmClaudeCodeError(executable, reason, details);
  }
}
