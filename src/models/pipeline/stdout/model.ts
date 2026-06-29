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

    'step:ai:tool': (action) => {
      if (!checkIsCompeted(action.meta.state)) {
        return null;
      }

      const message = action.preview(400);

      this.logger.info(
        `${action.step.trace().reverse().map((entity) => entity.title).join(' - ')}:`,
        `Tool [${action.name}] [${action.meta.state}] in ${action.meta.spent}ms`,
        message.length ? `\n${message}` : '',
      );
    },

    'step:ai:reasoning': (action) => {
      if (!checkIsCompeted(action.meta.state)) {
        return null;
      }

      const message = action.preview(400);

      this.logger.info(
        `${action.step.trace().reverse().map((entity) => entity.title).join(' - ')}:`,
        `Reasoning [${action.meta.state}] in ${action.meta.spent}ms`,
        message.length ? `\n${message}` : '',
      )
    },

    'step:ai:fallback': ({ step, providers }) => this.logger.info(
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
