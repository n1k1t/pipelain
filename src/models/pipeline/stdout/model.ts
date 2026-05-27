import type { PipelineSession } from '../session';
import type { TFunction } from '../../../../types';

type TPipelineStdoutHooks = {
  [K in keyof PipelineSession['TEvents']]: TFunction<unknown, PipelineSession['TEvents'][K]>;
};

export class PipelineStdout {
  private hooks: TPipelineStdoutHooks = {
    'warning': (event) => this.logger.info(event.message),
    'log': (event) => this.logger.info(
      `${event.pipeline.trace().reverse().map((entity) => entity.title).join(' - ')}:`,
      ...event.message,
    ),

    'run': (event) => event.meta.state !== 'INIT' && this.logger.info(
      `${event.pipeline.trace().reverse().map((entity) => entity.title).join(' - ')}: [${event.meta.state}]`,
      `in ${event.meta.spent}ms`
    ),

    'step:run': (event) => event.meta.state !== 'INIT' && this.logger.info(
      `${event.step.trace().reverse().map((entity) => entity.title).join(' - ')}: [${event.meta.state}]`,
      `in ${event.meta.spent}ms`
    ),

    'step:llm:tool': (event) => event.meta.state !== 'INIT' && this.logger.info(
      `${event.step.trace().reverse().map((entity) => entity.title).join(' - ')}:`,
      `Tool [${event.name}] [${event.meta.state}] in ${event.meta.spent}ms`,
      `\n${event.message}`
    ),

    'step:llm:reasoning': (event) => event.meta.state !== 'INIT' && this.logger.info(
      `${event.step.trace().reverse().map((entity) => entity.title).join(' - ')}:`,
      `Reasoning [${event.meta.state}] in ${event.meta.spent}ms`,
      `\n${event.message}`
    ),
  };

  constructor(private logger: Pick<Console, 'info' | 'warn'>) {}

  /** Overrides default event hook */
  public override<K extends keyof TPipelineStdoutHooks>(name: K, handler: TPipelineStdoutHooks[K]): this {
    this.hooks[name] = handler;
    return this;
  }

  public listen(session: PipelineSession): this {
    Object
      .entries(this.hooks)
      .forEach(([name, handler]) => session.on<any>(name, handler))

    return this;
  }

  static build(logger?: PipelineStdout['logger']): PipelineStdout {
    return new PipelineStdout(logger ?? console);
  }
}
