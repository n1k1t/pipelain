import { LanguageModel } from 'ai';

import { LlmToolCompiler } from '../tools/model';
import { Constructable } from '../../../../types';
import { ILlmSkill } from '../types';
import { LlmMcp } from '../mcp';

export type TLlmProviderReasoning = 'provider-default' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface ILlmProviderConnection {
  /** Provider API key */
  key: string;

  /** Provider base URL */
  url?: string;
}

export interface ILlmProviderFallback {
  /** Strategy to `continue` or `restart` a broken session with existing reasoning results and tool calls (default `restart`) */
  strategy?: 'continue' | 'restart';

  /** Providers to go next */
  providers: LlmProvider[];
}

export abstract class LlmProvider<TOptions extends object = any> {
  public abstract name: string;
  public abstract tag: LanguageModel;

  /** Model agent steps count limit `30 default` */
  public limit: number = this.provided.limit ?? 30;

  /** Provider options */
  public options: TOptions = this.provided.options;

  /** Available model skills */
  public skills: ILlmSkill[] = this.provided.skills ?? [];

  /** Available model tools */
  public tools: Record<string, LlmToolCompiler> = this.provided.tools ?? {};

  /** Available model MCP servers */
  public mcp: LlmMcp[] = this.provided.mcp ?? [];

  /** Provider connection configuration */
  public connection: ILlmProviderConnection = this.provided.connection;

  /** Provider fallback to switch if something goes wrong */
  public fallback?: ILlmProviderFallback = this.provided.fallback;

  /** Model temperature */
  public temperature?: number = this.provided.temperature;

  /** Model reasoning mode */
  public reasoning?: TLlmProviderReasoning = this.provided.reasoning;

  constructor(public model: string, protected provided: Pick<LlmProvider<TOptions>, 'connection' | 'options'> & {
    temperature?: number;
    limit?: number;

    reasoning?: LlmProvider<TOptions>['reasoning'];
    fallback?: LlmProvider<TOptions>['fallback'];
    skills?: LlmProvider<TOptions>['skills'];
    tools?: LlmProvider<TOptions>['tools'];
    mcp?: LlmProvider<TOptions>['mcp'];
  }) {}

  public abstract clone(): this;

  /** Casts options from specific provider */
  public cast<T extends object>(Provider: Constructable<LlmProvider<T>>): LlmProvider<T> {
    return <LlmProvider<T> & this>this;
  }

  /** Clones this instance and assigns new values */
  public assign(payload: Partial<Omit<LlmProvider<TOptions>['provided'], 'connection' | 'model'>>): this {
    const clone = this.clone();

    if (payload.temperature !== undefined) {
      clone.temperature = payload.temperature;
    }
    if (payload.options) {
      clone.options = payload.options;
    }
    if (payload.fallback) {
      clone.fallback = payload.fallback;
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
    if (payload.reasoning) {
      clone.reasoning = payload.reasoning;
    }

    return clone;
  }

  /** Returns next fallback provider */
  public next(): null | {
    strategy: ILlmProviderFallback['strategy'];
    provider: LlmProvider;
  } {
    if (!this.fallback?.providers.length) {
      return null;
    }

    const provider = this.fallback.providers[0];

    return {
      strategy: this.fallback.strategy ?? 'restart',

      provider: provider.assign({
        fallback: provider.fallback ?? {
          strategy: this.fallback.strategy ?? 'restart',
          providers: this.fallback.providers.slice(1),
        },
      }),
    };
  }
}
