import _ from 'lodash';

import { ZodType } from 'zod/v3';
import {
  APICallError,
  InvalidPromptError,
  Output,
  ProviderMetadata,
  streamText,
  Tool,
} from 'ai';

import { PipelineAiFallbackAction, PipelineAiReasoningAction, PipelineAiToolAction } from './actions';
import { skill, attachment, LlmHook, LlmToolCompiler, TLlmProviderReasoning } from '../../../llm';
import { ArticleContent, ContentFactory, SourcesContent, TContentLocation } from '../../../content';
import { IDefinition, TPipelineAiModelAction, TPipelineAiStepAction } from './types';
import { IPipelineStepSource, PipelineStep, PipelineStepCompiler } from '../model';
import { IPipelineConfiguration, TPipelineContentPredicate } from '../../types';
import { TPipelineStepNestedHandler, TPipelineStepType } from '../types';
import { compileDebug, compileMessages } from './utils';
import { PipelineStepCompilationError } from '../../errors';
import { PipelineParameters } from '../../parameters';
import { VirtualFileSystem } from '../../../vfs';
import { cast, disposify } from '../../../../utils';
import { PipelineAiError } from './errors';
import { LlmProvider } from '../../../llm/providers/model';

export * from './actions';
export * from './errors';
export * from './types';

export class PipelineAiStepCompiler<
  TConfiguration extends IPipelineConfiguration = any,
  TSchema = string
> extends PipelineStepCompiler<TSchema> {
  private type: Extract<TPipelineStepType, 'ai'> = 'ai';

  constructor(protected definition: Partial<IDefinition<TConfiguration>>) {
    super();
  }

  /** Provides output schema for LLM */
  public schema<T, TReturn extends PipelineAiStepCompiler<TConfiguration, T>>(
    predicate: ZodType<T> | TPipelineStepNestedHandler<TConfiguration, ZodType<T>>
  ): TReturn {
    this.definition.schema = predicate;
    return <this & TReturn>this;
  }

  /** Provides prompt for LLM */
  public prompt(predicate: IDefinition<TConfiguration>['prompt']): this {
    this.definition.prompt = predicate;
    return this;
  }

  /** Provides LLM model */
  public llm(predicate: IDefinition<TConfiguration>['llm']): this {
    this.definition.llm = predicate;
    return this;
  }

  /** Provides hooks for LLM tools (`before` handlers run in order of array) */
  public hooks(hooks: LlmHook[]): this {
    this.definition.hooks = hooks;
    return this;
  }

  /** Mocks AI output and saves prompt into `${project}/.pipelain/${time}-${session-id}/${title}.md` */
  public debug(): this {
    this.definition.debug = true;
    return this;
  }

  public compile(provided: IPipelineStepSource): PipelineAiStep<TConfiguration, TSchema> {
    if (!this.definition.prompt) {
      throw new PipelineStepCompilationError(this.type, '[command] is missing');
    }

    return new PipelineAiStep(this.type, {
      title: this.definition.title,
      debug: this.definition.debug ?? provided.pipeline.flags.debug,

      prompt: this.definition.prompt,
      schema: this.definition.schema,
      hooks: this.definition.hooks,
      llm: this.definition.llm,

      pipeline: provided.pipeline,
      parent: provided.parent,
    });
  }

  static build<TConfiguration extends IPipelineConfiguration, TSchema>(
    title?: string
  ): PipelineAiStepCompiler<TConfiguration, TSchema> {
    return new PipelineAiStepCompiler({ title });
  }
}

export class PipelineAiStep<
  TConfiguration extends IPipelineConfiguration = any,
  TSchema = any
> extends PipelineStep<'ai', TConfiguration, TSchema, IDefinition<TConfiguration>> {
  public async run(parameters: PipelineParameters<TConfiguration>): Promise<TSchema> {
    const vfs = VirtualFileSystem.build();

    this.meta.actualize('INIT');
    this.pipeline.session.emit('step:run', { step: this });

    try {
      const llm = typeof this.definition.llm === 'function'
        ? await this.definition.llm(parameters)
        : this.definition.llm ?? this.pipeline.context.llm;

      const content = typeof this.definition.prompt === 'function'
        ? await this.definition.prompt(parameters)
        : this.definition.prompt;

      await using mcp = disposify({
        entity: await Promise.all(llm.mcp.map((nested) => nested.connect())),
        exit: (clients) => Promise.allSettled(clients.map((client) => client.close())),
      });

      const messages = {
        system: {
          stack: cast<string[]>([]),

          segments: {
            articles: cast<string[]>([]),
            sources: cast<string[]>([]),
            rules: cast<string[]>([]),
            tasks: cast<string[]>([]),
          },
        },
        user: {
          stack: cast<string[]>([]),

          segments: {
            articles: cast<string[]>([]),
            sources: cast<string[]>([]),
            rules: cast<string[]>([]),
            tasks: cast<string[]>([]),
          },
        },
      } satisfies Record<TContentLocation, {
        stack: string[];
        segments: Record<string, string[]>;
      }>;

      content
        .reduce<TPipelineContentPredicate>((acc, segment) => {
          if (ContentFactory.is('group', segment)) {
            return acc.concat(segment.flat());
          }

          acc.push(segment);
          return acc;
        }, [])
        .forEach((segment) => {
          if (typeof segment === 'string') {
            return messages.user.segments.tasks.push(segment);
          }

          if (ContentFactory.is('article', segment)) {
            return messages[segment.location].segments.articles.push(segment.render());
          }
          if (ContentFactory.is('plain', segment)) {
            return messages[segment.location].segments.articles.push(segment.render());
          }

          if (ContentFactory.is('sources', segment)) {
            return messages[segment.location].segments.sources.push(...segment.serialize());
          }
          if (ContentFactory.is('rules', segment)) {
            return messages[segment.location].segments.rules.push(...segment.payload);
          }
          if (ContentFactory.is('tasks', segment)) {
            return messages[segment.location].segments.tasks.push(...segment.payload);
          }

          if (ContentFactory.is('attachment', segment)) {
            return vfs.register({
              title: segment.payload.title,
              key: segment.payload.key,

              content: segment.render(),
            });
          }
        });

      if (llm.skills.length) {
        messages.system.stack.push(
          ArticleContent
            .build({
              title: 'Available skills',
              content: [{ ul: llm.skills.map((skill) => `**${skill.name}**: ${skill.description}`) }],
            })
            .render()
        );
      }

      if (vfs.size) {
        messages.system.stack.push(
          ArticleContent
            .build({
              title: 'Attachments. Read **ALL** the content below using `attachment` tool **(IMPORTANT: FOLLOW THE ORDER)**',

              content: [{
                ol: SourcesContent
                  .build([...vfs.values()].map((file) => ({ path: file.key, title: file.title })))
                  .serialize()
              }],
            })
            .render()
        );
      }

      Object.values(messages).forEach((content) => {
        if (content.segments.articles.length) {
          content.stack.push(...content.segments.articles);
        }

        if (content.segments.rules.length) {
          content.stack.push(
            ArticleContent
              .build({ title: 'Rules', content: [{ ol: content.segments.rules }] })
              .render()
          );
        }

        if (content.segments.sources.length) {
          content.stack.push(
            ArticleContent
              .build({
                title: 'Sources. Read **ALL** the content below using `read` tool **(IMPORTANT: FOLLOW THE ORDER)**',
                content: [{ ol: content.segments.sources }],
              })
              .render()
          );
        }

        if (content.segments.tasks.length) {
          content.stack.push(
            ArticleContent
              .build({
                title: '**Task** (complete following list step by step)',
                tag: 'h1',

                content: [{ ol: content.segments.tasks }]
              })
              .render()
          );
        }
      });

      const tools = Object
        .entries(
          Object.assign({}, llm.tools, {
            ...(llm.skills.length && { skill }),
            ...(vfs.size && { attachment }),
          })
        )
        .reduce<Record<string, { tool: Tool<any, any>, compiler?: LlmToolCompiler }>>((acc, [name, compiler]) =>
          _.set(acc, name, {
            compiler,
            tool: compiler.compile(parameters.extend({ vfs, step: this })),
          }),
          {}
        );

      await Promise.all(
        mcp.entity.map(async (client) =>
          Object
            .entries(await client.tools())
            .forEach(([name, tool]) => _.set(tools, name, tools[name] ?? { tool }))
        )
      );

      Object.entries(tools).forEach(([name, source]) =>
        [...(this.definition.hooks ?? [])]
          .reverse()
          .filter((hook) => hook.belongs({ name, ...source }))
          .forEach((hook) => hook.wrap(source.tool, {
            session: parameters.session,
            context: parameters.context,
            step: this,
          }))
      );

      const result = await this.generate({
        parameters,
        llm,

        tools: _.mapValues(tools, (source) => source.tool),
        schema: typeof this.definition.schema === 'function'
          ? await this.definition.schema(parameters)
          : this.definition.schema,

        messages: {
          user: messages.user.stack.join('\n\n'),
          system: messages.system.stack.join('\n\n'),
        },
      });

      this.meta.actualize('DONE');
      this.pipeline.session.emit('step:run', { step: this });

      return result;
    } catch (error: unknown) {
      this.meta.actualize('ERROR');
      this.pipeline.session.emit('step:run', { step: this });

      throw error;
    }
  }

  private async generate(provided: {
    parameters: PipelineParameters;
    llm: LlmProvider;

    messages: {
      system: string;
      user: string;

      info?: string;

      history?: {
        actions: TPipelineAiModelAction[];
        trace?: ProviderMetadata;
      }[];
    };

    iteration?: number;
    actions?: TPipelineAiStepAction[];

    schema?: ZodType<TSchema>;
    tools?: Record<string, Tool>;

    errors?: {
      global?: PipelineAiError[];
      local?: PipelineAiError[];
    };
  }): Promise<TSchema> {
    const iteration = provided.iteration ?? 1;
    const actions = provided.actions ?? [];

    const history = {
      sequence: cast<string[]>([]),
      map: cast<Record<string, TPipelineAiModelAction>>({}),

      trace: cast<ProviderMetadata | undefined>(undefined),
    };

    const info = provided.messages.info ?? ArticleContent
      .build({
        title: 'Request info',

        content: [
          { p: `**Identifier:** ${Date.now().toString(32)}` },
          { p: `**Current date/time in ISO format:** ${new Date().toISOString()}` },
          { p: `**Steps limit:** ${provided.llm.limit}` },
        ],
      })
      .render();

    const instructions = [info, provided.messages.system].join('\n\n');
    const messages = compileMessages({
      user: provided.messages.user,
      history: provided.messages.history,
    });

    if (this.definition.debug) {
      return compileDebug(this, {
        messages: {
          system: instructions,
          user: provided.messages.user,
        },

        schema: provided.schema,
        tools: provided.tools,
      });
    }

    try {
      const stream = streamText({
        instructions,
        messages,

        ...(provided.schema && {
          output: Output.object({
            schema: provided.schema,
          }),
        }),

        providerOptions: {
          [provided.llm.name]: provided.llm.options,
        },

        maxOutputTokens: 32000,
        maxRetries: 0,

        temperature: provided.llm.temperature,
        reasoning: <Exclude<TLlmProviderReasoning, 'max'>>provided.llm.reasoning,
        model: provided.llm.tag,
        tools: provided.tools,

        experimental_telemetry: {
          isEnabled: true,
          functionId: this.title,
        },

        onError: () => undefined,
        onFinish: ({ finalStep }) => {
          history.trace = finalStep.providerMetadata;
        },
      });

      for await (const fragment of stream.stream) {
        switch(fragment.type) {
          case 'tool-call': {
            const action = PipelineAiToolAction.build(this, provided.llm, fragment);

            history.map[action.id] = action;
            actions.push(action);

            this.pipeline.session.emit('step:ai:tool', action);
            continue;
          };

          case 'tool-result': {
            const action = history.map[fragment.toolCallId];

            if (action instanceof PipelineAiToolAction) {
              history.sequence.push(action.id);
              this.pipeline.session.emit('step:ai:tool', action.complete('DONE', fragment));
            };

            continue;
          };

          case 'tool-error': {
            const action = history.map[fragment.toolCallId];

            if (action instanceof PipelineAiToolAction) {
              history.sequence.push(action.id);
              this.pipeline.session.emit('step:ai:tool', action.complete('ERROR', fragment));
            };

            continue;
          };

          case 'reasoning-start': {
            const action = PipelineAiReasoningAction.build(this, provided.llm, fragment);

            history.map[action.id] = action;
            actions.push(action);

            this.pipeline.session.emit('step:ai:reasoning', action);
            continue;
          };

          case 'reasoning-delta': {
            const action = history.map[fragment.id];

            if (action instanceof PipelineAiReasoningAction) {
              this.pipeline.session.emit('step:ai:reasoning', action.enrich(fragment));
            };

            continue;
          };

          case 'reasoning-end': {
            const action = history.map[fragment.id];

            if (action instanceof PipelineAiReasoningAction) {
              history.sequence.push(action.id);
              this.pipeline.session.emit('step:ai:reasoning', action.complete(fragment));
            };

            continue;
          };

          case 'error': {
            if (InvalidPromptError.isInstance(fragment.error)) {
              throw fragment.error;
            }
            if (APICallError.isInstance(fragment.error)) {
              throw fragment.error;
            }

            continue;
          };
        }
      }

      const output = await stream.output;
      if (typeof output === 'string' && !output.length) {
        throw PipelineAiError.build({ type: 'EMPTY_OUTPUT', llm: provided.llm });
      }

      this.meta.actualize('DONE');
      this.pipeline.session.emit('step:ai:complete', {
        actions,
        output,

        step: this,
        llm: provided.llm,
        usage: await stream.usage,

        messages: {
          system: provided.messages.system,
          user: provided.messages.user,
        },
      });

      return output;
    } catch (error: unknown) {
      const converted = PipelineAiError.convert({ source: error, llm: provided.llm });

      if (history.sequence.length) {
        converted.assign({ type: 'EMPTY_OUTPUT' });
      }

      const errors = {
        global: provided.errors?.global ?? [],
        local: (converted.is(['EMPTY_OUTPUT']) ? [] : (provided.errors?.local ?? [])).concat(converted),
      };

      const enough =
        (iteration < provided.llm.limit && !converted.is(['EMPTY_OUTPUT', 'WRONG_RESPONSE'])) ||
        iteration >= provided.llm.limit ||
        errors.local.filter((nested) => nested.is(['WRONG_RESPONSE'])).length >= 3;

      const fallback = enough ? provided.llm.next() : null;

      if (!fallback && enough) {
        this.meta.actualize('ERROR');
        this.pipeline.session.emit('step:ai:error', {
          actions,

          error: converted,
          llm: provided.llm,

          step: this,

          messages: {
            system: provided.messages.system,
            user: provided.messages.user,
          },
        });

        throw converted.assign({ sequence: errors.global });
      }

      if (fallback) {
        const action = PipelineAiFallbackAction.build(this, converted, {
          old: provided.llm,
          new: fallback.provider,
        });

        this.meta.actualize('PENDING');
        this.pipeline.session.emit('step:ai:fallback', action);

        actions.push(action);
      }

      return this.generate({
        actions,
        errors,

        parameters: provided.parameters,
        llm: provided.llm,

        iteration: iteration + 1,
        schema: provided.schema,
        tools: provided.tools,

        ...(fallback && {
          errors: {
            global: errors.global.concat(converted),
            local: undefined,
          },

          llm: fallback.provider,
          iteration: undefined,
        }),

        messages: {
          info,

          system: provided.messages.system,
          user: provided.messages.user,

          history: converted.is(['EMPTY_OUTPUT'])
            ? (provided.messages.history ?? []).concat({
              actions: history.sequence.map((id) => history.map[id]),
              trace: history.trace,
            })
            : provided.messages.history,

          ...(fallback?.strategy === 'restart' && {
            history: undefined,
            info: undefined,
          }),
        },
      });
    }
  }
}
