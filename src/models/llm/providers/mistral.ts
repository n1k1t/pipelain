import { createMistral } from '@ai-sdk/mistral';
import { LanguageModel } from 'ai';

import { SetPartialKeys } from '../../../../types';
import { LlmProvider } from './model';

export class LlmMistralProvider extends LlmProvider {
  public name: string = 'mistral';

  public tag: LanguageModel = createMistral({
    apiKey: this.connection.key,
    baseURL: this.connection.url,
  })(this.model);

  public clone(): this {
    const clone = new LlmMistralProvider(this.model, {
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
    parameters: SetPartialKeys<LlmMistralProvider['provided'], 'options'>
  ): LlmMistralProvider {
    return new LlmMistralProvider(model, { ...parameters, options: parameters.options ?? {} });
  }
}
