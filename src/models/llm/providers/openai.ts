import { createOpenAI, OpenAIChatLanguageModelOptions } from '@ai-sdk/openai';
import { LanguageModel } from 'ai';

import { SetPartialKeys } from '../../../../types';
import { LlmProvider } from './model';

export class LlmOpenaiProvider extends LlmProvider<OpenAIChatLanguageModelOptions> {
  public name: string = 'openai';

  public tag: LanguageModel = createOpenAI({
    apiKey: this.connection.key,
    baseURL: this.connection.url,
  })(this.model);

  public clone(): this {
    const clone = LlmOpenaiProvider.build(this.model, {
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
    parameters: SetPartialKeys<LlmOpenaiProvider['provided'], 'options'>
  ): LlmOpenaiProvider {
    return new LlmOpenaiProvider(model, {
      ...parameters,

      options: parameters.options ?? {
        reasoningEffort: 'low',
      },
    });
  }
}
