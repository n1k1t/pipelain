import { LLlmModelProviderName, TLlmModelProviderName } from './types';
import { LlmProvider } from './providers/model';

import * as providers from './providers';
import env from '../../env';

export class LlmRouter {
  constructor(private configuration: {
    key: string;

    provider?: string;
    url?: string;
  }) {}

  /** Returns a language model based on the provider and model name */
  public provide(model: string = env.model): LlmProvider {
    const provider: TLlmModelProviderName = LLlmModelProviderName.includes(<TLlmModelProviderName>this.configuration.provider)
      ? <TLlmModelProviderName>this.configuration.provider
      : this.define(model);

    switch (provider) {
      case 'anthropic': return providers.LlmAnthropicProvider.build(model, { connection: this.configuration });
      case 'mistral': return providers.LlmMistralProvider.build(model, { connection: this.configuration });
      case 'google': return providers.LlmGoogleProvider.build(model, { connection: this.configuration });
      case 'proxy': return providers.LlmProxyProvider.build(model, { connection: this.configuration });

      case 'openai':
      default: return providers.LlmOpenaiProvider.build(model, { connection: this.configuration });
    }
  }

  /** Defines model provider by its name */
  private define(model: string): TLlmModelProviderName {
    if (model.includes('gpt')) {
      return 'openai';
    }
    if (model.includes('claude')) {
      return 'anthropic';
    }
    if (model.includes('gemini')) {
      return 'google';
    }
    if (model.includes('mistral') || model.includes('pixtral')) {
      return 'mistral';
    }

    return 'openai';
  }

  static build(options?: Partial<LlmRouter['configuration']>): LlmRouter {
    return new LlmRouter({
      provider: options?.provider ?? env.provider,
      key: options?.key ?? env.key ?? 'none',
      url: options?.url ?? env.url,
    })
  }
}
