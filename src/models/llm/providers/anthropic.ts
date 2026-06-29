import { AnthropicLanguageModelOptions, createAnthropic } from '@ai-sdk/anthropic';
import { LanguageModel } from 'ai';

import { SetPartialKeys } from '../../../../types';
import { LlmProvider } from './model';

export class LlmAnthropicProvider extends LlmProvider<AnthropicLanguageModelOptions> {
  public name: string = 'anthropic';

  public tag: LanguageModel = createAnthropic({
    apiKey: this.connection.key,
    baseURL: this.connection.url,
  })(this.model);

  public clone(): this {
    const clone = LlmAnthropicProvider.build(this.model, {
      temperature: this.temperature,
      connection: this.connection,
      limit: this.limit,

      options: Object.assign({}, this.options),
      tools: Object.assign({}, this.tools),

      skills: [...this.skills],
      mcp: [...this.mcp],

      ...(this.fallback && {
        fallback: {
          strategy: this.fallback.strategy,
          providers: [...this.fallback.providers],
        },
      }),
    });

    return <this>clone;
  }

  static build(
    model: string,
    parameters: SetPartialKeys<LlmAnthropicProvider['provided'], 'options'>
  ): LlmAnthropicProvider {
    return new LlmAnthropicProvider(model, {
      ...parameters,

      options: parameters.options ?? {
        thinking: {
          type: 'enabled',
          budgetTokens: 1024,
        },
      },
    });
  }
}
