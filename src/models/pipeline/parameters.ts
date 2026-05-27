import type { IPipelineConfiguration } from './types';
import type { PipelineSession } from './session';
import type { PipelineContext } from './context';
import type { Pipeline } from './model';

import { PipelineFactory } from './factory';
import { ContentFactory } from '../content';
import { Bash } from '../bash';

export class PipelineParameters<TConfiguration extends IPipelineConfiguration = any> {
  public context: PipelineContext<TConfiguration> = this.pipeline.context;
  public session: PipelineSession = this.pipeline.session;

  public factory: PipelineFactory<TConfiguration> = PipelineFactory.build(this.pipeline);

  public utils = {
    /** Utills for content creation */
    content: ContentFactory.build(this.pipeline.context.project),

    /** Bash executor */
    bash: Bash.build({ cwd: this.pipeline.context.project.cwd }),

    /** Logs provided message */
    log: (...message: unknown[]) => this.session.emit('log', { message, pipeline: this.pipeline }),
  };

  constructor(public pipeline: Pipeline<TConfiguration>) {}

  /** Creates a new one instance and asigns a provided payload into clone */
  public extend<T extends object>(payload: T): PipelineParameters<TConfiguration> & T {
    return Object.assign(PipelineParameters.build(this.pipeline), payload);
  }

  static build<TConfiguration extends IPipelineConfiguration>(
    pipeline: Pipeline<TConfiguration>,
  ): PipelineParameters<TConfiguration> {
    return new PipelineParameters<TConfiguration>(pipeline);
  }
}
