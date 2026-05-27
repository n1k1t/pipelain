import type { ConvertTupleToUnion } from '../../../types';

export type TLlmModelProviderName = ConvertTupleToUnion<typeof LLlmModelProviderName>;
export const LLlmModelProviderName = <const>['google', 'anthropic', 'mistral', 'openai', 'proxy'];

export interface ILlmSkill {
  name: string;
  description: string;

  content: string;
}
