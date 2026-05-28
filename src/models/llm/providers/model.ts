import { LanguageModel } from 'ai';

import { LlmToolCompiler } from '../tools/model';
import { ILlmSkill } from '../types';
import { LlmMcp } from '../mcp';

export abstract class LlmProvider<TOptions extends object = {}> {
  public abstract name: string;
  public abstract tag: LanguageModel;

  /** Model temperature `0.1 default` */
  public temperature: number = this.provided.temperature ?? 0.1;

  /** Model agent steps count limit `30 default` */
  public limit: number = this.provided.limit ?? 30;

  /** Model provider options */
  public options: TOptions = this.provided.options;

  /** Model skills */
  public skills: ILlmSkill[] = this.provided.skills ?? [];

  /** Model tools */
  public tools: Record<string, LlmToolCompiler> = this.provided.tools ?? {};

  /** Models MCP servers */
  public mcp: LlmMcp[] = this.provided.mcp ?? [];

  public connection: {
    key: string;
    url?: string;
  } = this.provided.connection;

  constructor(public model: string, protected provided: Pick<LlmProvider<TOptions>, 'connection' | 'options'> & {
    temperature?: number;
    limit?: number;

    skills?: LlmProvider<TOptions>['skills'];
    tools?: LlmProvider<TOptions>['tools'];
    mcp?: LlmProvider<TOptions>['mcp'];
  }) {}

  public abstract clone(): this;

  /** Clones this instance and assigns new values */
  public assign(
    payload: Partial<Pick<LlmProvider<TOptions>, 'temperature' | 'options' | 'tools' | 'limit' | 'skills' | 'mcp'>>
  ): this {
    const clone = this.clone();

    if (payload.temperature !== undefined) {
      clone.temperature = payload.temperature;
    }
    if (payload.options) {
      clone.options = payload.options;
    }
    if (payload.tools) {
      clone.tools = payload.tools;
    }
    if (payload.skills) {
      clone.skills = payload.skills;
    }
    if (payload.mcp) {
      clone.mcp = payload.mcp;
    }
    if (payload.limit) {
      clone.limit = payload.limit;
    }

    return clone;
  }
}
