import minimatch from 'minimatch';
import matter from 'gray-matter';
import _ from 'lodash';

import { LlmToolCompiler } from './tools/model';
import { ILlmSkill } from './types';

import * as tools from './tools';

export class LlmToolsFactory {
  protected included: Record<string, LlmToolCompiler> = {};

  /** Provides included tools */
  public provide(): Record<string, LlmToolCompiler> {
    return this.included;
  }

  /** Includes all tools */
  public all(): this {
    this.included = tools;
    return this;
  }

  /** Includes web tools (like `search` and `fetch`) */
  public web(): this {
    this.included.search = tools.search;
    this.included.fetch = tools.fetch;

    return this;
  }

  /** Includes files tools (like `read`, `grep`, `edit` and etc) */
  public files(mode: 'read' | 'read-write', options?: {
    /** Restricts tools to work with provided paths/minimatch patterns OLNY */
    allowed?: {
      rm?: string[];
      edit?: string[];
      write?: string[];
    };
  }): this {
    this.included.grep = tools.grep;
    this.included.glob = tools.glob;
    this.included.read = tools.read;
    this.included.ls = tools.ls;

    if (mode === 'read-write') {
      this.included.mkdir = tools.mkdir;

      this.included.write = tools.write.options({ allowed: options?.allowed?.write });
      this.included.edit = tools.edit.options({ allowed: options?.allowed?.edit });
      this.included.rm = tools.rm.options({ allowed: options?.allowed?.rm });
    }

    return this;
  }

  /** Includes commands tools (like `npm` and `npx`) */
  public commands(list: (keyof Pick<typeof tools, 'npm' | 'npx'>)[]): this {
    list.forEach((name) => _.set(this.included, name, tools[name]));
    return this;
  }

  /** Includes custom tools */
  public custom(payload: Record<string, LlmToolCompiler>): this {
    Object.assign(this.included, payload);
    return this;
  }

  static build(): LlmToolsFactory {
    return new LlmToolsFactory();
  }
}

export class LlmSkillsFactory {
  protected included: Record<string, ILlmSkill> = {};

  constructor(protected registered: Record<string, ILlmSkill>) {}

  /** Registers raw skill markdown file content */
  public register(raw: string): this {
    const { data, content } = matter(raw);

    this.registered[data.name] = {
      name: data.name,
      description: data.description,

      content: content.trim(),
    };

    return this;
  }

  /** Provides included skills */
  public provide(): ILlmSkill[] {
    return Object.values(this.included);
  }

  /** Includes all registered skills */
  public all(): this {
    this.included = this.registered;
    return this;
  }

  /** Matches and injects skills by minimatch pattern */
  public match(predicate: string | string[]): this {
    const patterns = _.castArray(predicate);

    Object
      .keys(this.registered)
      .filter((name) => patterns.some((pattern) => minimatch(name, pattern, { matchBase: true })))
      .forEach((name) => _.set(this.included, name, this.registered[name]));

    return this;
  }

  /** Includes custom (unregistered) skills */
  public custom(list: ILlmSkill[]): this {
    list.forEach((skill) => _.set(this.included, skill.name, skill));
    return this;
  }

  static build(registered: LlmSkillsFactory['registered'] = {}): LlmSkillsFactory {
    return new LlmSkillsFactory(registered);
  }
}
