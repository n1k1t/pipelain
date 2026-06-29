import { AssistantContent, ProviderMetadata, TextStreamPart } from 'ai';
import _ from 'lodash';

import type { PipelineAiStep } from '../index';

import { PipelineAiAction } from './model';
import { cast } from '../../../../../utils';

type TStartFragment = Extract<TextStreamPart<any>, { type: 'reasoning-start' }>;
type TDeltaFragment = Extract<TextStreamPart<any>, { type: 'reasoning-delta' }>;
type TEndFragment = Extract<TextStreamPart<any>, { type: 'reasoning-end' }>;

export class PipelineAiReasoningAction extends PipelineAiAction {
  public id: string = this.fragment.id;

  /** Execution provider metadata and options */
  public trace = {
    initial: cast<TStartFragment['providerMetadata']>(this.fragment.providerMetadata),
    final: cast<TEndFragment['providerMetadata']>(undefined),
  };

  public output: string = '';
  public delta: string = '';

  constructor(public step: PipelineAiStep, public fragment: TStartFragment) {
    super(step);
  }

  /** Renders output preview */
  public preview(limit: number = 100): string {
    return _.truncate(this.output, { length: limit }).replace(/\n/g, '↩ ');
  }

  public provide(kind: 'initial' | 'final'): ProviderMetadata | null {
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
      providerOptions: this.trace.final ?? this.trace.initial,
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

    return this.actualize('DONE');
  }

  static build(step: PipelineAiStep, fragment: TStartFragment): PipelineAiReasoningAction {
    return new PipelineAiReasoningAction(step, fragment);
  }
}
