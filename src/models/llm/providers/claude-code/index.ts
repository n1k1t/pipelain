import { LanguageModel } from 'ai';

import type { ILlmClaudeCodeOptions } from './types';
import type { SetPartialKeys } from '../../../../../types';

import { ILlmProviderCompilation, LlmProvider } from '../model';
import { LlmClaudeCodeCli } from './cli';

export * from './errors';
export * from './types';
export * from './cli';

/**
 * Provider which runs prompts with the local Claude Code CLI (`claude --print`)
 * Structured output is passed as JSON schema (`--json-schema`), pipeline tools are bridged via local MCP server
 */
export class LlmClaudeCodeProvider extends LlmProvider<ILlmClaudeCodeOptions> {
  public name: string = 'claude-code';

  /** Builds the language model which runs in the project directory and bridges pipeline tools into Claude Code via MCP */
  public compile(provided: ILlmProviderCompilation): LanguageModel {
    return LlmClaudeCodeCli.build(this.model, this.options, this.connection, provided);
  }

  /** Checks the Claude Code CLI is installed and returns its version */
  public check(): Promise<string> {
    return LlmClaudeCodeCli.check(this.options.executable, this.options.env);
  }

  public clone(): this {
    const clone = LlmClaudeCodeProvider.build(this.model, {
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
    parameters: SetPartialKeys<LlmClaudeCodeProvider['provided'], 'options' | 'connection'>
  ): LlmClaudeCodeProvider {
    return new LlmClaudeCodeProvider(model, {
      ...parameters,

      connection: parameters.connection ?? { key: 'none' },
      options: parameters.options ?? {},
    });
  }
}
