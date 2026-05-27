import { LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

import { SetPartialKeys } from '../../../../types';
import { LlmProvider } from './model';

export class LlmOpenaiProvider extends LlmProvider<{
  reasoningEffort?: 'low' | (string & {});
}> {
  public name: string = 'openai';

  public tag: LanguageModel = createOpenAI({
    apiKey: this.connection.key,
    baseURL: this.connection.url,
  })(this.model);

  public clone(): this {
    const clone = new LlmOpenaiProvider(this.model, {
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
