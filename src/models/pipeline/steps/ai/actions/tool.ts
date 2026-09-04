import { ProviderMetadata, TextStreamPart, ToolCallPart, ToolResultPart } from 'ai';
import _ from 'lodash';

import type { PipelineAiStep } from '../index';
import type { LlmProvider } from '../../../../llm';

import { cast, parseJsonSafe, preview } from '../../../../../utils';
import { PipelineAiAction } from './model';

type TResultFragment = Extract<TextStreamPart<any>, { type: 'tool-result' }>;
type TErrorFragment = Extract<TextStreamPart<any>, { type: 'tool-error' }>;
type TCallFragment = Extract<TextStreamPart<any>, { type: 'tool-call' }>;

type TInput =
  | { type: 'json', value: object }
  | { type: 'text', value: string };

type TOutput =
  | { type: 'error', value: PipelineAiToolActionError }
  | { type: 'json', value: object }
  | { type: 'text', value: string };

type TPipelineAiToolActionErrorType = 'text' | 'json';
type TPipelineAiToolActionErrorSchema<K extends TPipelineAiToolActionErrorType = TPipelineAiToolActionErrorType> = {
  text: {
    type: 'text';
    payload: string;
  };

  json: {
    type: 'json';
    payload: object;
  };
}[K];

export class PipelineAiToolActionError<
  TSchema extends TPipelineAiToolActionErrorSchema = TPipelineAiToolActionErrorSchema
> extends Error {
  constructor(public type: TSchema['type'], public payload: TSchema['payload']) {
    super(_.isObject(payload) ? JSON.stringify(payload) : payload);
  }

  public is<K extends TPipelineAiToolActionErrorType>(
    type: K
  ): this is PipelineAiToolActionError<TPipelineAiToolActionErrorSchema<K>> {
    return this.type === type;
  }

  static convert(error: unknown): PipelineAiToolActionError {
    if (error instanceof Error) {
      return new PipelineAiToolActionError('text', error.message);
    }
    if (_.isObject(error)) {
      return new PipelineAiToolActionError('json', error);
    }

    if (typeof error === 'string') {
      const parsed = parseJsonSafe(error);

      return parsed.status === 'OK'
        ? new PipelineAiToolActionError('json', parsed.result)
        : new PipelineAiToolActionError('text', error);
    }

    return new PipelineAiToolActionError('text', String(error));
  }
}

export class PipelineAiToolAction extends PipelineAiAction {
  public TPlain!: {
    type: 'ai:tool';
    id: string;

    name: string;
    meta: PipelineAiToolAction['meta'];
    input: TInput;

    trace?: object;
    output?: TOutput;

    llm: {
      name: string;
      model: string;

      parameters: Pick<LlmProvider, 'reasoning' | 'temperature'>;
      options?: object;
    };
  };

  public name: string = this.fragment.toolName;
  public id: string = this.fragment.toolCallId;

  /** Execution provider metadata and options */
  public trace = {
    initial: cast<Pick<TCallFragment, 'providerMetadata' | 'providerExecuted'>>({
      providerMetadata: this.fragment.providerMetadata,
      providerExecuted: this.fragment.providerExecuted,
    }),

    final: cast<object | undefined>(undefined),
  };

  public input: TInput = _.isObject(this.fragment.input)
    ? { type: 'json', value: this.fragment.input }
    : { type: 'text', value: String(this.fragment.input) };

  public output?: TOutput;

  constructor(public step: PipelineAiStep, public llm: LlmProvider, public fragment: TCallFragment) {
    super(step);
  }

  /** Renders input parameters preview */
  public preview(limit: number = 100): string {
    return this.input.type === 'text'
      ? _.truncate(this.input.value, { length: limit }).replace(/\n/g, '↩ ')
      : preview(this.input.value, limit);
  }

  public provide(kind: 'initial' | 'final'): object | null {
    return (
      kind === 'initial'
        ? this.trace.initial.providerMetadata
        : this.trace.final ?? this.trace.initial.providerMetadata
    ) ?? null;
  }

  public format(type: 'call-part'): ToolCallPart;
  public format(type: 'result-part'): ToolResultPart;

  public format(type: 'call-part' | 'result-part'): ToolCallPart | ToolResultPart {
    if (type === 'call-part') {
      return {
        type: 'tool-call',
        input: this.input.value,

        toolCallId: this.id,
        toolName: this.name,

        providerOptions: this.trace.initial.providerMetadata,
        providerExecuted: this.trace.initial.providerExecuted,
      };
    }

    const part: Omit<ToolResultPart, 'output'> = {
      type: 'tool-result',

      toolCallId: this.id,
      toolName: this.name,

      providerOptions: <ProviderMetadata>(this.trace.final ?? this.trace.initial.providerMetadata),
    };

    if (!this.output) {
      return Object.assign(part, {
        output: cast<ToolResultPart['output']>({
          type: 'text',
          value: 'Empty',

          providerOptions: <ProviderMetadata>(this.trace.final ?? this.trace.initial.providerMetadata),
        }),
      });
    }

    if (this.output.type === 'json') {
      return Object.assign(part, {
        output: cast<ToolResultPart['output']>({
          type: 'json',
          value: JSON.stringify(this.output.value),

          providerOptions: <ProviderMetadata>(this.trace.final ?? this.trace.initial.providerMetadata),
        }),
      });
    }

    if (this.output.type === 'text') {
      return Object.assign(part, {
        output: cast<ToolResultPart['output']>({
          type: 'text',
          value: this.output.value,

          providerOptions: <ProviderMetadata>(this.trace.final ?? this.trace.initial.providerMetadata),
        }),
      });
    }

    if (this.output.value.is('json')) {
      return Object.assign(part, {
        output: cast<ToolResultPart['output']>({
          type: 'error-json',
          value: JSON.stringify(this.output.value.payload),

          providerOptions: <ProviderMetadata>(this.trace.final ?? this.trace.initial.providerMetadata),
        }),
      });
    }

    return Object.assign(part, {
      output: cast<ToolResultPart['output']>({
        type: 'error-text',
        value: String(this.output.value.payload),

        providerOptions: <ProviderMetadata>(this.trace.final ?? this.trace.initial.providerMetadata),
      }),
    });
  }

  public complete(state: 'DONE', fragment: TResultFragment): this;
  public complete(state: 'ERROR', fragment: TErrorFragment): this;

  public complete(state: 'DONE' | 'ERROR', fragment: TResultFragment | TErrorFragment): this {
    if (fragment.providerMetadata) {
      this.trace.final = fragment.providerMetadata;
    }

    if (state === 'DONE' && 'output' in fragment) {
      if (_.isObject(fragment.output)) {
        this.output = {
          type: 'json',
          value: fragment.output,
        };
      }

      if (typeof fragment.output === 'string') {
        const parsed = parseJsonSafe(fragment.output);

        this.output = parsed.status === 'OK'
          ? { type: 'json', value: parsed.result }
          : { type: 'text', value: String(fragment.output) };
      }
    }

    if (state === 'ERROR' && 'error' in fragment) {
      this.output = {
        type: 'error',
        value: PipelineAiToolActionError.convert(fragment.error),
      };
    }

    return this.actualize(state);
  }

  public toPlain(): PipelineAiToolAction['TPlain'] {
    return {
      type: 'ai:tool',
      id: this.id,

      name: this.name,
      meta: this.meta,
      input: this.input,

      trace: this.trace.final ?? this.trace.initial.providerMetadata,
      output: this.output,

      llm: {
        name: this.llm.name,
        model: this.llm.model,

        options: this.llm.options,
        parameters: {
          temperature: this.llm.temperature,
          reasoning: this.llm.reasoning,
        }
      },
    };
  }

  static build(step: PipelineAiStep, llm: LlmProvider, fragment: TCallFragment): PipelineAiToolAction {
    return new PipelineAiToolAction(step, llm, fragment);
  }
}
