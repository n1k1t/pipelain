import type { LanguageModel } from 'ai';
import type { ConvertTupleToUnion } from '../../../types';

export type TLlmModelProviderName = ConvertTupleToUnion<typeof LLlmModelProviderName>;
export const LLlmModelProviderName = <const>[
  'antigravity',
  'claude-code',
  'anthropic',
  'mistral',
  'google',
  'openai',
  'codex',
  'proxy',
];

export interface ILlmSkill {
  name: string;
  description: string;

  content: string;
}

/** Language model of AI SDK provider specification v4 */
export type TLlmLanguageModel = Extract<LanguageModel, { specificationVersion: 'v4' }>;
export type TLlmCallOptions = Parameters<TLlmLanguageModel['doStream']>[0];

export type TLlmStreamResult = Awaited<ReturnType<TLlmLanguageModel['doStream']>>;
export type TLlmGenerateResult = Awaited<ReturnType<TLlmLanguageModel['doGenerate']>>;

export type TLlmStreamPart = TLlmStreamResult['stream'] extends ReadableStream<infer T> ? T : never;
export type TLlmFinishPart = Extract<TLlmStreamPart, { type: 'finish' }>;
export type TLlmWarning = Extract<TLlmStreamPart, { type: 'stream-start' }>['warnings'][number];
