import z, { ZodType } from 'zod/v3';

import { IPipelineConfiguration, TPipelineCompilerConfigurationStep, TPipelineStepGeneralHandler } from './types';
import { PipelineStep, PipelineStepCompiler, TPipelineStepNestedHandler } from './steps';
import { buildMetaManager, cast } from '../../utils';
import { PipelineParameters } from './parameters';
import { PipelineContext } from './context';
import { PipelineSession } from './session';
import { PipelineStdout } from './stdout';
import { Project } from '../project';

export class PipelineCompiler<TConfiguration extends IPipelineConfiguration = any> {
  public TSchema!: TConfiguration['state'];

  constructor(public title: string, protected definition: {
    steps: TPipelineCompilerConfigurationStep[];

    description?: string;
    input?: Pipeline<TConfiguration>['schema'];

    defaults?: PipelineContext<TConfiguration>['defaults'];
  }) {}

  public description(content: string): this {
    this.definition.description = content;
    return this;
  }

  /** Provides input schema */
  public input<T, TReturn extends PipelineCompiler<{ input: T; state: TConfiguration['state'] }>>(
    schema: ZodType<T>
  ): TReturn {
    this.definition.input = schema;
    return <this & TReturn>this;
  }

  /** Clones this instance */
  public clone(): PipelineCompiler<TConfiguration> {
    return new PipelineCompiler<TConfiguration>(this.title, {
      defaults: this.definition.defaults,

      steps: this.definition.steps,
      input: this.definition.input,
    });
  }

  /** Clones this instance and provides default values */
  public defaults<
    T extends NonNullable<PipelineCompiler<TConfiguration>['definition']['defaults']>,
    TReturn extends PipelineCompiler<{
      state: TConfiguration['state'];
      input: 'input' extends keyof T
        ? TConfiguration['input'] | void
        : TConfiguration['input'];
    }>
  >(payload: T): TReturn {
    const clone = this.clone();

    clone.definition.defaults = payload;
    return <this & TReturn>clone;
  }

  /** Provides anonymous step */
  public step(handler: TPipelineStepGeneralHandler<TConfiguration>): this;

  /** Provides named step that saves output into `context.state` */
  public step<K extends string, TCompiler extends PipelineStepCompiler | PipelineCompiler>(
    name: K,
    handler: TPipelineStepGeneralHandler<TConfiguration, TCompiler>
  ): PipelineCompiler<{
    input: TConfiguration['input'];

    state: TConfiguration['state'] & {
      [TKey in K]: TCompiler['TSchema'];
    };
  }>;

  public step(
    nameOrHandler: string | TPipelineStepGeneralHandler | TPipelineStepNestedHandler,
    handler?: TPipelineStepGeneralHandler
  ): PipelineCompiler {
    if (typeof nameOrHandler === 'string' && handler) {
      this.definition.steps.push({ type: 'named', name: nameOrHandler, handler });
      return this;
    }

    if (typeof nameOrHandler === 'function') {
      this.definition.steps.push({ type: 'anonymous', handler: nameOrHandler });
    }

    return this;
  }

  public async compile(provided?: {
    project?: Project;
    stdout?: PipelineStdout;

    session?: PipelineSession;
    parent?: Pipeline['parent'];
  }): Promise<Pipeline<TConfiguration>> {
    const project = provided?.project ?? await Project.build();
    const session = provided?.session
      ? provided.session
      : provided?.parent
        ? provided.parent instanceof Pipeline
          ? provided.parent.session
          : provided.parent.pipeline.session
        : null;

    const pipeline = Pipeline.build<TConfiguration>({
      title: this.title,
      description: this.definition.description,

      schema: this.definition.input ?? z.undefined(),

      context: PipelineContext.build(project, this.definition.defaults),
      session: session ?? PipelineSession.build(),

      steps: this.definition.steps,
      parent: provided?.parent,
    });

    if (provided?.stdout) {
      provided.stdout.listen(pipeline.session);
    }

    return pipeline;
  }

  static build<TState extends object = {}>(title: string): PipelineCompiler<{ state: TState; input: void }> {
    return new PipelineCompiler(title, {
      steps: [],
    });
  }
}

export class Pipeline<TConfiguration extends IPipelineConfiguration = any> {
  public context: PipelineContext<TConfiguration> = this.provided.context;
  public session: PipelineSession = this.provided.session;

  public title: string = this.provided.title;
  public description: string = this.provided.description ?? `Pipeline of ${this.title}`;

  public schema: ZodType<TConfiguration['input']> = this.provided.schema;
  public parent?: Pipeline | PipelineStep = this.provided.parent;

  constructor(protected provided: Pick<Pipeline, 'context'> & {
    title: string;
    schema: Pipeline['schema'];

    steps: TPipelineCompilerConfigurationStep[];
    session: PipelineSession;

    parent?: Pipeline['parent'];
    description?: string;
  }) {}

  public async run(input: TConfiguration['input']): Promise<TConfiguration['state']> {
    this.context.input = input ?? this.context.input;

    const parameters = PipelineParameters.build(this);
    const meta = buildMetaManager();

    await this.schema.parseAsync(this.context.input);
    this.session.emit('run', { pipeline: this, meta: meta.init() });

    for (const step of this.provided.steps) {
      if (step.type === 'named' && step.name in this.context.state) {
        continue;
      }

      const handled = await step.handler(parameters);
      const compiled = handled instanceof PipelineStepCompiler || handled instanceof PipelineCompiler
        ? (
          await handled.compile({
            project: this.context.project,
            session: parameters.session,

            pipeline: this,
            parent: this,
          })
        )
        : null;

      if (!compiled) {
        if (step.type === 'named') {
          Object.assign(this.context.state, { [step.name]: handled });
        }

        continue;
      }

      const result = compiled instanceof PipelineStep
        ? await compiled.run(parameters)
        : await compiled.run(undefined);

      if (step.type === 'named') {
        Object.assign(this.context.state, { [step.name]: result });
      }
    }

    this.session.emit('run', { pipeline: this, meta: meta.done() });
    return this.context.state;
  }

  /** Traces instances from this to origin */
  public trace(): (Pipeline | PipelineStep)[] {
    return this.parent
      ? cast<(Pipeline | PipelineStep)[]>([this]).concat(this.parent.trace())
      : [this];
  }

  static build<TConfiguration extends IPipelineConfiguration>(provided: Pipeline['provided']): Pipeline<TConfiguration> {
    return new Pipeline(provided);
  }
}
