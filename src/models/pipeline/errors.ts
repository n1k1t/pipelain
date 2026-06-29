import type { TPipelineStepType } from './steps';

export class PipelineStepCompilationError extends Error {
  constructor(type: TPipelineStepType, reason: string) {
    super(`Cannot compile [${type}] step. Reson: ${reason}`);
  }
}
