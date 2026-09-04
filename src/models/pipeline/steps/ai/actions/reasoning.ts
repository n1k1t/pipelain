import { AssistantContent, ProviderMetadata, TextStreamPart } from 'ai';
import _ from 'lodash';

import type { PipelineAiStep } from '../index';
import type { LlmProvider } from '../../../../llm';

import { PipelineAiAction } from './model';
import { cast } from '../../../../../utils';

type TStartFragment = Extract<TextStreamPart<any>, { type: 'reasoning-start' }>;
type TDeltaFragment = Extract<TextStreamPart<any>, { type: 'reasoning-delta' }>;
type TEndFragment = Extract<TextStreamPart<any>, { type: 'reasoning-end' }>;

export class PipelineAiReasoningAction extends PipelineAiAction {
  public TPlain!: {
    type: 'ai:reasoning';
    id: string;

    meta: PipelineAiReasoningAction['meta'];
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
    return _.truncate(this.output, { length: limit }).replace(/\n/g, '↩ ');
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

    return this.actualize('PENDING');
  }

  public complete(fragment: TEndFragment): this {
    if (fragment.providerMetadata) {
      this.trace.final = fragment.providerMetadata;
    }

    this.output = this.output.trim();
    return this.actualize('DONE');
  }

  public toPlain(): PipelineAiReasoningAction['TPlain'] {
    return {
      type: 'ai:reasoning',
      id: this.id,

      meta: this.meta,
      output: this.output,

      trace: this.trace.final ?? this.trace.initial,

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
