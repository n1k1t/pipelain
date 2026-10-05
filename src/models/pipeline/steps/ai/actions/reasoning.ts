import { AssistantContent, ProviderMetadata, TextStreamPart } from 'ai';

import type { PipelineAiStep } from '../index';
import type { LlmProvider } from '../../../../llm';

import { PipelineAiAction } from './model';
import { cast, preview } from '../../../../../utils';

type TStartFragment = Extract<TextStreamPart<any>, { type: 'reasoning-start' }>;
type TDeltaFragment = Extract<TextStreamPart<any>, { type: 'reasoning-delta' }>;
type TEndFragment = Extract<TextStreamPart<any>, { type: 'reasoning-end' }>;

export class PipelineAiReasoningAction extends PipelineAiAction {
  public TPlain!: {
    type: 'ai:reasoning';
    id: string;

    meta: PipelineAiReasoningAction['meta']['TPlain'];
    output: string;

    trace?: object;

    llm: {
      name: string;
      model: string;

      parameters: Pick<LlmProvider, 'reasoning' | 'temperature'>;
      options?: object;
    };
  };

  public id: string = this.fragment.id;

  /** Execution provider metadata and options */
  public trace = {
    initial: cast<object | undefined>(this.fragment.providerMetadata),
    final: cast<object | undefined>(undefined),
  };

  public output: string = '';
  public delta: string = '';

  constructor(public step: PipelineAiStep, public llm: LlmProvider, public fragment: TStartFragment) {
    super(step);
  }

  /** Renders output preview */
  public preview(limit: number = 100): string {
    return preview(this.output, limit);
  }

  public provide(kind: 'initial' | 'final'): object | null {
    return (
      kind === 'initial'
        ? this.trace.initial
        : this.trace.final ?? this.trace.initial
    ) ?? null;
  }

  public format(): Extract<Extract<AssistantContent, any[]>[number], { type: 'reasoning' }> {
    return {
      type: 'reasoning',

      text: this.output,
      providerOptions: <ProviderMetadata>(this.trace.final ?? this.trace.initial),
    };
  }

  public enrich(fragment: TDeltaFragment): this {
    if (fragment.providerMetadata) {
      this.trace.final = fragment.providerMetadata;
    }

    this.output += fragment.text;
    this.delta = fragment.text;

    this.meta.actualize('PENDING');
    return this;
  }

  public complete(fragment: TEndFragment): this {
    if (fragment.providerMetadata) {
      this.trace.final = fragment.providerMetadata;
    }

    this.output = this.output.trim();

    this.meta.actualize('DONE');
    return this;
  }

  public toPlain(): PipelineAiReasoningAction['TPlain'] {
    return {
      type: 'ai:reasoning',
      id: this.id,

      output: this.output,
      trace: this.trace.final ?? this.trace.initial,

      meta: this.meta.toPlain(),

      llm: {
        name: this.llm.name,
        model: this.llm.model,

        options: this.llm.options,
        parameters: {
          temperature: this.llm.temperature,
          reasoning: this.llm.reasoning,
        },
      },
    };
  }

  static build(step: PipelineAiStep, llm: LlmProvider, fragment: TStartFragment): PipelineAiReasoningAction {
    return new PipelineAiReasoningAction(step, llm, fragment);
  }
}
