import { APICallError } from 'ai';

export interface ILlmAntigravityErrorDetails {
  /** CLI arguments of the failed call */
  args?: string[];

  /** Raw events or output of the Antigravity CLI */
  body?: string;

  cause?: unknown;
}

/** Error of the Antigravity CLI call (extends `APICallError` to be handled by pipeline steps as `BAD_API_CALL`) */
export class LlmAntigravityError extends APICallError {
  constructor(public executable: string, reason: string, details: ILlmAntigravityErrorDetails = {}) {
    super({
      message: `Cannot use Antigravity CLI [${executable}]: ${reason}`,
      url: `cli://${executable}`,

      requestBodyValues: { args: details.args ?? [] },
      responseBody: details.body,

      isRetryable: false,
      cause: details.cause,
    });
  }

  static build(executable: string, reason: string, details?: ILlmAntigravityErrorDetails): LlmAntigravityError {
    return new LlmAntigravityError(executable, reason, details);
  }
}
