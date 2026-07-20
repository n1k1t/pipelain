import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { LanguageModel } from 'ai';

import { SetPartialKeys } from '../../../../types';
import { LlmProvider } from './model';

export class LlmProxyProvider extends LlmProvider<object> {
  public name: string = 'proxy';

  public tag: LanguageModel = createOpenAICompatible({
    name: this.name,

    apiKey: this.connection.key,
    baseURL: this.connection.url ?? 'none',

    includeUsage: true,
    supportsStructuredOutputs: true,
  })(this.model);

  public clone(): this {
    const clone = LlmProxyProvider.build(this.model, {
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
    parameters: SetPartialKeys<LlmProxyProvider['provided'], 'options'>
  ): LlmProxyProvider {
    return new LlmProxyProvider(model, { ...parameters, options: parameters.options ?? {} });
  }
}
