import { createGoogleGenerativeAI, GoogleLanguageModelOptions } from '@ai-sdk/google';
import { LanguageModel } from 'ai';

import { SetPartialKeys } from '../../../../types';
import { LlmProvider } from './model';

export class LlmGoogleProvider extends LlmProvider<GoogleLanguageModelOptions> {
  public name: string = 'google';

  public tag: LanguageModel = createGoogleGenerativeAI({
    apiKey: this.connection.key,
    baseURL: this.connection.url,
  })(this.model);

  public clone(): this {
    const clone = LlmGoogleProvider.build(this.model, {
      temperature: this.temperature,
      connection: this.connection,
      reasoning: this.reasoning,
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
    parameters: SetPartialKeys<LlmGoogleProvider['provided'], 'options'>
  ): LlmGoogleProvider {
    return new LlmGoogleProvider(model, { ...parameters, options: parameters.options ?? {} });
  }
}
