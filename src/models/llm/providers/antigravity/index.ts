import { LanguageModel } from 'ai';

import type { ILlmAntigravityOptions } from './types';
import type { SetPartialKeys } from '../../../../../types';

import { ILlmProviderCompilation, LlmProvider } from '../model';
import { LlmAntigravityCli } from './cli';

export * from './errors';
export * from './types';
export * from './cli';

/**
 * Provider which runs prompts with the local Antigravity CLI (`agy --print`)
 * Structured output is passed as JSON schema (`--json-schema`), pipeline tools are bridged via local MCP server
 */
export class LlmAntigravityProvider extends LlmProvider<ILlmAntigravityOptions> {
  public name: string = 'antigravity';

  /** Builds the language model which runs in the project directory and bridges pipeline tools into Antigravity via MCP */
  public compile(provided: ILlmProviderCompilation): LanguageModel {
    return LlmAntigravityCli.build(this.model, this.options, this.connection, provided);
  }

  /** Checks the Antigravity CLI is installed and returns its version */
  public check(): Promise<string> {
    return LlmAntigravityCli.check(this.options.executable, this.options.env);
  }

  public clone(): this {
    const clone = LlmAntigravityProvider.build(this.model, {
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
    parameters: SetPartialKeys<LlmAntigravityProvider['provided'], 'options' | 'connection'>
  ): LlmAntigravityProvider {
    return new LlmAntigravityProvider(model, {
      ...parameters,

      connection: parameters.connection ?? { key: 'none' },
      options: parameters.options ?? {},
    });
  }
}
