import { createMistral, MistralLanguageModelOptions } from '@ai-sdk/mistral';
import { LanguageModel } from 'ai';

import { SetPartialKeys } from '../../../../types';
import { LlmProvider } from './model';

export class LlmMistralProvider extends LlmProvider<MistralLanguageModelOptions> {
  public name: string = 'mistral';

  public tag: LanguageModel = createMistral({
    apiKey: this.connection.key,
    baseURL: this.connection.url,
  })(this.model);

  public clone(): this {
    const clone = LlmMistralProvider.build(this.model, {
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
    parameters: SetPartialKeys<LlmMistralProvider['provided'], 'options'>
  ): LlmMistralProvider {
    return new LlmMistralProvider(model, { ...parameters, options: parameters.options ?? {} });
  }
}
