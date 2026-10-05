import minimatch from 'minimatch';

import { LLlmModelProviderName, TLlmModelProviderName } from './types';
import { ILlmProviderConnection, LlmProvider } from './providers/model';

import * as providers from './providers';
import env from '../../env';

export interface ILlmRouterProviders {
  anthropic: providers.LlmAnthropicProvider;
  mistral: providers.LlmMistralProvider;
  google: providers.LlmGoogleProvider;
  openai: providers.LlmOpenaiProvider;
  proxy: providers.LlmProxyProvider;
}

export interface ILlmRouterSetup<K extends TLlmModelProviderName = TLlmModelProviderName> {
  /** Provider connection configuration that overrides the router one */
  connection?: Partial<ILlmProviderConnection>;

  /** Provider options */
  options?: ILlmRouterProviders[K]['options'];
}

export class LlmRouter {
  protected registrations = new Set<{
    pattern: string;
    handler: (model: string) => LlmProvider;
  }>();

  protected setups: { [K in TLlmModelProviderName]?: ILlmRouterSetup<K> } = {};

  constructor(protected configuration: {
    key: string;

    provider?: string;
    url?: string;
  }) {}

  /** Registers a provider handler for models matched by minimatch pattern */
  public register(pattern: string, handler: (model: string) => LlmProvider): this {
    this.registrations.add({ pattern, handler });
    return this;
  }

  /** Saves connection and options of a provider to pass them into its models */
  public setup<K extends TLlmModelProviderName>(provider: K, parameters: ILlmRouterSetup<K>): this {
    this.setups[provider] = <(typeof this.setups)[K]>parameters;
    return this;
  }

  /** Returns a language model based on the provider and model name */
  public provide(model: string = env.model): LlmProvider {
    for (const registration of this.registrations) {
      if (minimatch(model, registration.pattern)) {
        return registration.handler(model);
      }
    }

    const provider: TLlmModelProviderName = LLlmModelProviderName.includes(<TLlmModelProviderName>this.configuration.provider)
      ? <TLlmModelProviderName>this.configuration.provider
      : this.define(model);

    switch (provider) {
      case 'anthropic': return providers.LlmAnthropicProvider.build(model, this.compile('anthropic'));
      case 'mistral': return providers.LlmMistralProvider.build(model, this.compile('mistral'));
      case 'google': return providers.LlmGoogleProvider.build(model, this.compile('google'));
      case 'proxy': return providers.LlmProxyProvider.build(model, this.compile('proxy'));

      case 'openai':
      default: return providers.LlmOpenaiProvider.build(model, this.compile('openai'));
    }
  }

  /** Compiles provider build parameters from the router configuration and provider setup */
  private compile<K extends TLlmModelProviderName>(provider: K): {
    connection: ILlmProviderConnection;
    options?: ILlmRouterProviders[K]['options'];
  } {
    const setup = this.setups[provider];

    return {
      connection: setup?.connection ? { ...this.configuration, ...setup.connection } : this.configuration,
      ...(setup?.options && { options: setup.options }),
    };
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
