import { APICallError, NoObjectGeneratedError } from 'ai';
import _ from 'lodash';

import type { LlmProvider } from '../../../llm';

export class PipelineAiError extends Error {
  public type: 'EMPTY_OUTPUT' | 'WRONG_RESPONSE' | 'BAD_API_CALL' = this.provided.type;
  public llm: LlmProvider = this.provided.llm;

  /** Errors sequence bolong to this */
  public sequence: PipelineAiError[] = this.provided.sequence ?? [];
  public reason: string = this.provided.reason ?? 'none';


  constructor(protected provided: Pick<PipelineAiError, 'type' | 'llm'> & {
    sequence?: PipelineAiError['sequence'];
    reason?: PipelineAiError['reason'];
  }) {
    super(`Got error [${provided.type}] while generation. Reason: ${provided.reason}`);
  }

  public is(types: PipelineAiError['type'][]): boolean {
    return types.includes(this.type);
  }

  public assign(payload: Partial<Pick<PipelineAiError, 'type' | 'sequence'>>): this {
    if (payload.type) {
      this.type = payload.type;
    }
    if (payload.sequence?.length) {
      this.sequence = payload.sequence;
    }

    return this;
  }

  /** Returns full sequence of this error (in ascending order) */
  public research(): PipelineAiError[] {
    if (this.sequence.length) {
      return _.uniq(
        this.sequence
          .reduce<PipelineAiError[]>((acc, error) => acc.concat(error.research()), [])
          .concat(this)
          .reverse()
      );
    }

    return [this];
  }

  static build(provided: PipelineAiError['provided']): PipelineAiError {
    return new PipelineAiError(provided);
  }

  static convert(provided: {
    error: unknown;
    llm: LlmProvider;
  }): PipelineAiError {
    if (provided.error instanceof PipelineAiError) {
      return provided.error;
    }

    if (APICallError.isInstance(provided.error)) {
      return new PipelineAiError({
        type: 'BAD_API_CALL',

        reason: provided.error.message,
        llm: provided.llm,
      });
    }
    if (NoObjectGeneratedError.isInstance(provided.error)) {
      return new PipelineAiError({
        type: 'WRONG_RESPONSE',

        reason: provided.error.message,
        llm: provided.llm,
      });
    }

    const reason = String(
      _.isObject(provided.error) && 'message' in provided.error
        ? provided.error.message
        : provided.error
    );

    return new PipelineAiError({
      reason,

      type: 'BAD_API_CALL',
      llm: provided.llm,
    });
  }
}
