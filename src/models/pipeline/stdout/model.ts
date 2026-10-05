import type { PipelineSession } from '../session';
import type { TFunction } from '../../../../types';

type TPipelineStdoutHooks = {
  [K in keyof PipelineSession['TEvents']]: TFunction<unknown, PipelineSession['TEvents'][K]>;
};

export class PipelineStdout {
  private hooks: TPipelineStdoutHooks = {
    'step:ai:complete': () => null,
    'step:ai:error': () => null,

    'log': ({ pipeline, message, level }) => {
      const method = level === 'DEBUG'
        ? this.logger.debug
        : level === 'INFO'
          ? this.logger.info
          : this.logger.warn;

      return method.call(
        this.logger,
        `${pipeline.trace().reverse().map((entity) => entity.title).join(' - ')}:`,
        ...message,
      );
    },

    'run': ({ pipeline }) => pipeline.meta.is(['DONE', 'ERROR']) && this.logger.info(
      `${pipeline.trace().reverse().map((entity) => entity.title).join(' - ')}: [${pipeline.meta.state}]`,
      `in ${pipeline.meta.spent}ms`
    ),

    'step:run': ({ step }) => step.meta.is(['DONE', 'ERROR']) && this.logger.info(
      `${step.trace().reverse().map((entity) => entity.title).join(' - ')}: [${step.meta.state}]`,
      `in ${step.meta.spent}ms`
    ),

    'step:ai:tool': (action) => {
      if (!action.meta.is(['DONE', 'ERROR'])) {
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
      if (!action.meta.is(['DONE', 'ERROR']) || !action.output.length) {
        return null;
      }

      const message = action.preview(400);

      this.logger.info(
        `${action.step.trace().reverse().map((entity) => entity.title).join(' - ')}:`,
        `Reasoning [${action.meta.state}] in ${action.meta.spent}ms`,
        message.length ? `\n${message}` : '',
      )
    },

    'step:ai:fallback': ({ step, llm }) => this.logger.info(
      `${step.trace().reverse().map((entity) => entity.title).join(' - ')}:`,
      `Fallback from [${llm.old.model}] to [${llm.new.model}]`
    ),
  };

  constructor(protected logger: Pick<Console, 'info' | 'warn' | 'debug'>) {}

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
