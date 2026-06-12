import type { IPipelineSessionEventMeta, PipelineSession } from '../session';
import type { TFunction } from '../../../../types';

type TPipelineStdoutHooks = {
  [K in keyof PipelineSession['TEvents']]: TFunction<unknown, PipelineSession['TEvents'][K]>;
};

const checkIsCompeted = (state: IPipelineSessionEventMeta['state']) =>
  state === 'DONE' || state === 'ERROR';

export class PipelineStdout {
  private hooks: TPipelineStdoutHooks = {
    'warning': (event) => this.logger.info(event.message),

    'log': ({ pipeline, message }) => this.logger.info(
      `${pipeline.trace().reverse().map((entity) => entity.title).join(' - ')}:`,
      ...message,
    ),

    'run': ({ pipeline, meta }) => checkIsCompeted(meta.state) && this.logger.info(
      `${pipeline.trace().reverse().map((entity) => entity.title).join(' - ')}: [${meta.state}]`,
      `in ${meta.spent}ms`
    ),

    'step:run': ({ step, meta }) => checkIsCompeted(meta.state) && this.logger.info(
      `${step.trace().reverse().map((entity) => entity.title).join(' - ')}: [${meta.state}]`,
      `in ${meta.spent}ms`
    ),

    'step:llm:tool': ({ step, meta, name, message }) => checkIsCompeted(meta.state) && this.logger.info(
      `${step.trace().reverse().map((entity) => entity.title).join(' - ')}:`,
      `Tool [${name}] [${meta.state}] in ${meta.spent}ms`,
      `\n${message}`
    ),

    'step:llm:reasoning': ({ step, meta, message }) => checkIsCompeted(meta.state) && this.logger.info(
      `${step.trace().reverse().map((entity) => entity.title).join(' - ')}:`,
      `Reasoning [${meta.state}] in ${meta.spent}ms`,
      `\n${message}`
    ),

    'step:llm:fallback': ({ step, providers }) => this.logger.info(
      `${step.trace().reverse().map((entity) => entity.title).join(' - ')}:`,
      `Fallback from [${providers.old.model}] to [${providers.new.model}]`
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
