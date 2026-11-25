import { LanguageModel } from 'ai';

import type { ILlmCodexOptions } from './types';
import type { SetPartialKeys } from '../../../../../types';

import { ILlmProviderCompilation, LlmProvider } from '../model';
import { LlmCodexCli } from './cli';

export * from './errors';
export * from './types';
export * from './cli';

/**
 * Provider which runs prompts with the local Codex CLI (`codex exec`)
 * Structured output is passed as JSON schema (`--output-schema`), pipeline tools are bridged via local MCP server
 */
export class LlmCodexProvider extends LlmProvider<ILlmCodexOptions> {
  public name: string = 'codex';

  /** Builds the language model which runs in the project directory and bridges pipeline tools into Codex via MCP */
  public compile(provided: ILlmProviderCompilation): LanguageModel {
    return LlmCodexCli.build(this.model, this.options, this.connection, provided);
  }

  /** Checks the Codex CLI is installed and returns its version */
  public check(): Promise<string> {
    return LlmCodexCli.check(this.options.executable, this.options.env);
  }

  public clone(): this {
    const clone = LlmCodexProvider.build(this.model, {
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
    parameters: SetPartialKeys<LlmCodexProvider['provided'], 'options' | 'connection'>
  ): LlmCodexProvider {
    return new LlmCodexProvider(model, {
      ...parameters,

      connection: parameters.connection ?? { key: 'none' },
      options: parameters.options ?? {},
    });
  }
}
