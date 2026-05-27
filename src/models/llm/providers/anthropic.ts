import { createAnthropic } from '@ai-sdk/anthropic';
import { LanguageModel } from 'ai';

import { SetPartialKeys } from '../../../../types';
import { LlmProvider } from './model';

export class LlmAnthropicProvider extends LlmProvider<{
  thinking?: {
    type?: 'enabled' | 'disabled';
    budgetTokens?: number;
  };
}> {
  public name: string = 'anthropic';

  public tag: LanguageModel = createAnthropic({
    apiKey: this.connection.key,
    baseURL: this.connection.url,
  })(this.model);

  public clone(): this {
    const clone = new LlmAnthropicProvider(this.model, {
      temperature: this.temperature,
      connection: this.connection,

      options: Object.assign({}, this.options),
      tools: Object.assign({}, this.tools),

      skills: [...this.skills],
      mcp: [...this.mcp],
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
