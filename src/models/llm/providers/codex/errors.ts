import { APICallError } from 'ai';

export interface ILlmCodexErrorDetails {
  /** CLI arguments of the failed call */
  args?: string[];

  /** Raw events or output of the Codex CLI */
  body?: string;

  cause?: unknown;
}

/** Error of the Codex CLI call (extends `APICallError` to be handled by pipeline steps as `BAD_API_CALL`) */
export class LlmCodexError extends APICallError {
  constructor(public executable: string, reason: string, details: ILlmCodexErrorDetails = {}) {
    super({
      message: `Cannot use Codex CLI [${executable}]: ${reason}`,
      url: `cli://${executable}`,

      requestBodyValues: { args: details.args ?? [] },
      responseBody: details.body,

      isRetryable: false,
      cause: details.cause,
    });
  }

  static build(executable: string, reason: string, details?: ILlmCodexErrorDetails): LlmCodexError {
    return new LlmCodexError(executable, reason, details);
  }
}
