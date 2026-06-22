import _ from 'lodash';

import { ModelMessage, Output, ProviderMetadata, streamText, Tool, ToolResultPart } from 'ai';
import { ZodType } from 'zod/v3';
import { zocker } from 'zocker';

import { IPipelineStepDefinition, IPipelineStepSource, PipelineStep, PipelineStepCompiler } from './model';
import { buildMetaManager, cast, disposify, IMetaManager, preview } from '../../../utils';
import { IPipelineConfiguration, TPipelineContentPredicate } from '../types';
import { ArticleContent, ContentFactory, SourcesContent } from '../../content';
import { PipelineAiError, PipelineStepCompilationError } from '../errors';
import { TPipelineStepNestedHandler, TPipelineStepType } from './types';
import { PipelineParameters } from '../parameters';
import { VirtualFileSystem } from '../../vfs';
import { LlmProvider } from '../../llm/providers/model';
import { skill } from '../../llm';
import { File } from '../../file';

interface IDefinition<TConfiguration extends IPipelineConfiguration> extends IPipelineStepDefinition {
  prompt: TPipelineContentPredicate | TPipelineStepNestedHandler<TConfiguration, TPipelineContentPredicate>;

  schema?: ZodType | TPipelineStepNestedHandler<TConfiguration, ZodType>;
  llm?: LlmProvider | TPipelineStepNestedHandler<TConfiguration, LlmProvider>;

  debug?: boolean;
}

interface IAgentToolCall {
  type: 'tool';

  id: string;
  name: string;

  provider?: ProviderMetadata;

  output: {
    type: 'text' | 'json' | 'error',
    value: unknown;
  };

  input: {
    preview: string;
    value: unknown;
  };
}

interface IAgentReasoning {
  type: 'reasoning';

  id: string;
  text: string;

  provider?: ProviderMetadata;
}

type TAgentAction =
  | (IAgentToolCall & { meta: IMetaManager })
  | (IAgentReasoning & { meta: IMetaManager });

const renderDebugHeader = (title: string): string => [
  '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
  title.toUpperCase().padStart(40, ' '),
  '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
].join('\n');

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
      debug: this.definition.debug,

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

      const system: string[] = [];
      const user: string[] = [];

      const articles: string[] = [];
      const sources: string[] = [];
      const rules: string[] = [];
      const tasks: string[] = [];

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
            return tasks.push(segment);
          }

          if (ContentFactory.is('article', segment)) {
            return articles.push(segment.render());
          }
          if (ContentFactory.is('plain', segment)) {
            return articles.push(segment.render());
          }

          if (ContentFactory.is('sources', segment)) {
            return sources.push(...segment.serialize());
          }
          if (ContentFactory.is('rules', segment)) {
            return rules.push(...segment.payload);
          }
          if (ContentFactory.is('tasks', segment)) {
            return tasks.push(...segment.payload);
          }

          if (ContentFactory.is('attachment', segment)) {
            if (segment.payload.isVirtual) {
              return vfs.register({
                title: segment.payload.title,
                path: segment.payload.path,

                content: segment.render(),
              });
            }

            return sources.push(
              ...SourcesContent
                .build([{ location: segment.payload.path, title: segment.payload.title }])
                .serialize()
            )
          }
        });

      for (const file of vfs.values()) {
        sources.push(
          ...SourcesContent.build([{ location: file.path, title: file.title }]).serialize()
        );
      }

      if (llm.skills.length) {
        system.push(
          ArticleContent
            .build({
              title: 'Available skills',
              content: [{ ul: llm.skills.map((skill) => `**${skill.name}**: ${skill.description}`) }],
            })
            .render()
        );
      }

      if (sources.length) {
        system.push(
          ArticleContent
            .build({
              title: 'Sources. Read **ALL** the files below **(IMPORTANT: FOLLOW THE ORDER)**',
              content: [{ ol: sources }],
            })
            .render()
        );
      }

      if (rules.length) {
        system.push(ArticleContent.build({ title: 'Rules', content: [{ ol: rules }] }).render());
      }
      if (articles.length) {
        system.push(...articles);
      }
      if (tasks.length) {
        user.push(
          ArticleContent
            .build({ title: '**Task** (complete following list step by step)', content: [{ ol: tasks }] })
            .render()
        );
      }

      const tools = Object
        .entries(
          llm.skills.length
            ? Object.assign({}, llm.tools, { skill })
            : llm.tools
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
          user: user.join('\n\n'),
          system: system.join('\n\n'),
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
      user: string;
      system: string;

      info?: string;

      history?: {
        actions: (IAgentToolCall | IAgentReasoning)[];
        provider?: ProviderMetadata;
      }[];
    };

    iteration?: number;
    schema?: ZodType<TSchema>;
    tools?: Record<string, Tool>;

    errors?: {
      global?: PipelineAiError[];
      local?: PipelineAiError[];
    };
  }): Promise<TSchema> {
    const iteration = provided.iteration ?? 1;
    const actions = {
      sequence: cast<string[]>([]),
      map: cast<Record<string, TAgentAction>>({}),
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

    const messages: ModelMessage[] = [
      {
        role: 'system',
        content: [info, provided.messages.system].join('\n\n'),
      },
      {
        role: 'user',
        content: provided.messages.user,
      },
    ];

    if (provided.messages.history?.length) {
      provided.messages.history.forEach((record) =>
        messages.push(
          {
            role: 'assistant',
            providerOptions: record.provider,

            content: record.actions.map((action) => {
              if (action.type === 'reasoning') {
                return {
                  type: 'reasoning',
                  text: action.text,

                  providerOptions: action.provider,
                  id: action.id,
                };
              }

              return {
                type: 'tool-call',

                providerOptions: action.provider,
                toolName: action.name,

                toolCallId: action.id,
                input: action.input.value,
              };
            }),
          },
          {
            role: 'tool',
            providerOptions: record.provider,

            content: record.actions.filter((action) => action.type === 'tool').map((action) => ({
              type: 'tool-result',

              providerOptions: action.provider,
              toolCallId: action.id,
              toolName: action.name,

              output: <ToolResultPart['output']>{
                type: action.output.type === 'error' ? 'error-text' : action.output.type,
                value: action.output.value,
              },
            })),
          }
        )
      );
    }

    if (this.definition.debug) {
      const location = `${new Date().toLocaleTimeString()}-${this.pipeline.session.id}`;
      const title = this.trace().reverse().map((entity) => _.kebabCase(entity.title)).join('.');
      const file = await File.build(`.pipeline/${location}/${title}.md`);

      file.append([
        `${renderDebugHeader('tools')}\n`,

        ...Object
          .entries(provided.tools ?? {})
          .map(([name, tool]) => `# \`${name}\`\n\n${tool.description}\n\n---\n`)
      ].join('\n'))

      messages.forEach((message) =>
        file.append([`${renderDebugHeader(message.role)}\n`, message.content].join('\n'))
      );

      await file.write(file.content.trim());
      return provided.schema ? zocker(provided.schema).generate() : <TSchema>'DEBUG AI OUTPUT';
    }

    try {
      const stream = streamText({
        messages,

        experimental_telemetry: {
          isEnabled: true,
          functionId: this.title,

          metadata: {
            sessionId: this.pipeline.session.id,
          },
        },

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
        model: provided.llm.tag,
        tools: provided.tools,

        onError: () => undefined,
      });

      for await (const fragment of stream.fullStream) {
        if (fragment.type === 'tool-call') {
          const action: TAgentAction = {
            type: 'tool',
            meta: buildMetaManager(),

            id: fragment.toolCallId,
            name: fragment.toolName,
            provider: fragment.providerMetadata,

            input: {
              preview: _.isObject(fragment.input) ? preview(fragment.input) : String(fragment.input),
              value: fragment.input,
            },

            output: {
              type: 'text',
              value: undefined,
            },
          };

          actions.map[fragment.toolCallId] = action;

          this.pipeline.session.emit('step:llm:tool', {
            step: this,
            name: fragment.toolName,

            meta: action.meta.init(),
            message: action.input.preview,
          });
        }

        if (fragment.type === 'tool-result') {
          const action = actions.map[fragment.toolCallId];

          if (action?.type === 'tool') {
            if (fragment.providerMetadata) {
              action.provider = fragment.providerMetadata;
            }

            action.output = {
              type: _.isObject(fragment.output) ? 'json' : 'text',
              value: fragment.output,
            };

            actions.sequence.push(fragment.toolCallId);

            this.pipeline.session.emit('step:llm:tool', {
              step: this,
              name: fragment.toolName,

              meta: action.meta.done(),
              message: action.input.preview,
            });
          }
        }

        if (fragment.type === 'tool-error') {
          const action = actions.map[fragment.toolCallId];

          if (action?.type === 'tool') {
            if (fragment.providerMetadata) {
              action.provider = fragment.providerMetadata;
            }

            action.output = {
              type: 'error',
              value: fragment.error instanceof Error ? fragment.error.message : String(fragment.error),
            };

            actions.sequence.push(fragment.toolCallId);

            this.pipeline.session.emit('step:llm:tool', {
              step: this,
              name: fragment.toolName,

              meta: action.meta.error(),
              message: action.input.preview,
            });
          }
        }

        if (fragment.type === 'reasoning-start') {
          const action: TAgentAction = {
            type: 'reasoning',
            meta: buildMetaManager(),

            id: fragment.id,
            provider: fragment.providerMetadata,

            text: '',
          };

          actions.map[fragment.id] = action;

          this.pipeline.session.emit('step:llm:reasoning', {
            step: this,

            meta: action.meta.init(),
            message: 'Thinking',
          });
        }

        if (fragment.type === 'reasoning-delta') {
          const action = actions.map[fragment.id];

          if (action?.type === 'reasoning') {
            if (fragment.providerMetadata) {
              action.provider = fragment.providerMetadata;
            }

            this.pipeline.session.emit('step:llm:reasoning', {
              step: this,

              meta: action.meta.pending(),
              message: fragment.text,
            });

            action.text += fragment.text;
            action.meta = buildMetaManager();
          }
        }

        if (fragment.type === 'reasoning-end') {
          const action = actions.map[fragment.id];

          if (action?.type === 'reasoning') {
            if (fragment.providerMetadata) {
              action.provider = fragment.providerMetadata;
            }

            actions.sequence.push(fragment.id);

            this.pipeline.session.emit('step:llm:reasoning', {
              step: this,

              meta: action.meta.done(),
              message: action.text,
            });
          }
        }

        if (fragment.type === 'error' && fragment.error instanceof Error) {
          throw PipelineAiError.convert({ error: fragment.error, llm: provided.llm });
        }
      }

      const output = await stream.output;
      if (typeof output === 'string' && !output.length) {
        throw PipelineAiError.build({ type: 'EMPTY_OUTPUT', llm: provided.llm });
      }

      const usage = await stream.usage;

      if (usage.inputTokens) {
        this.pipeline.session.meta.llm.tokens.input += usage.inputTokens;
      }
      if (usage.outputTokens) {
        this.pipeline.session.meta.llm.tokens.output += usage.outputTokens;
      }

      return output;
    } catch (error: unknown) {
      const converted = PipelineAiError.convert({ error, llm: provided.llm });

      if (actions.sequence.length) {
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
        throw converted.assign({ sequence: errors.global });
      }

      if (fallback) {
        this.pipeline.session.emit('step:llm:fallback', {
          reason: converted,
          step: this,

          providers: {
            old: provided.llm,
            new: fallback.provider,
          },
        });
      }

      return this.generate({
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
              provider: Object.values(actions.map).find((action) => action.provider)?.provider,
              actions: actions.sequence.map((id) => actions.map[id]),
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
