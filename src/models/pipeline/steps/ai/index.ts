import _ from 'lodash';

import { ZodType } from 'zod/v3';
import {
  APICallError,
  InvalidPromptError,
  ModelMessage,
  Output,
  ProviderMetadata,
  streamText,
  Tool,
} from 'ai';

import { PipelineAiFallbackAction, PipelineAiReasoningAction, PipelineAiToolAction } from './actions';
import { ArticleContent, ContentFactory, SourcesContent, TContentLocation } from '../../../content';
import { IDefinition, TPipelineAiModelAction, TPipelineAiStepAction } from './types';
import { IPipelineStepSource, PipelineStep, PipelineStepCompiler } from '../model';
import { IPipelineConfiguration, TPipelineContentPredicate } from '../../types';
import { TPipelineStepNestedHandler, TPipelineStepType } from '../types';
import { buildMetaManager, cast, disposify } from '../../../../utils';
import { PipelineStepCompilationError } from '../../errors';
import { PipelineParameters } from '../../parameters';
import { VirtualFileSystem } from '../../../vfs';
import { skill, attachment } from '../../../llm';
import { PipelineAiError } from './errors';
import { compileDebug } from './utils';
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
    const meta = buildMetaManager();
    const vfs = VirtualFileSystem.build();

    this.pipeline.session.emit('step:run', { step: this, meta: meta.init() });

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
        .reduce<Record<string, Tool<any, any>>>((acc, [name, compiler]) =>
          _.set(acc, name, compiler.compile(parameters.extend({ vfs, step: this }))),
          {}
        );

      await Promise.all(
        mcp.entity.map(async (client) =>
          Object
            .entries(await client.tools())
            .forEach(([name, tool]) => _.set(tools, name, tools[name] ?? tool))
        )
      );

      const result = await this.generate({
        parameters,
        tools,
        llm,

        schema: typeof this.definition.schema === 'function'
          ? await this.definition.schema(parameters)
          : this.definition.schema,

        messages: {
          user: messages.user.stack.join('\n\n'),
          system: messages.system.stack.join('\n\n'),
        },
      });

      this.pipeline.session.emit('step:run', { step: this, meta: meta.done() });
      return result;
    } catch (error: unknown) {
      this.pipeline.session.emit('step:run', { step: this, meta: meta.error() });

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
    const messages: ModelMessage[] = [{
      role: 'user',
      content: provided.messages.user,
    }];

    provided.messages.history?.forEach((record) => {
      if (record.actions.every((action) => action instanceof PipelineAiReasoningAction)) {
        return messages.push({
          role: 'assistant',
          providerOptions: record.trace,

          content: record.actions.map((action: PipelineAiReasoningAction) => action.format()),
        });
      }

      messages.push(
        {
          role: 'assistant',
          providerOptions: record.trace,

          content: record.actions.map((action) =>
            action instanceof PipelineAiReasoningAction
              ? action.format()
              : action.format('call-part')
          ),
        },
        {
          role: 'tool',
          providerOptions: record.trace,

          content: record.actions
            .filter((action) => action instanceof PipelineAiToolAction)
            .map((action) => action.format('result-part')),
        },
      );
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
        reasoning: provided.llm.reasoning,
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
