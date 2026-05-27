import minimatch from 'minimatch';
import matter from 'gray-matter';
import path from 'path';
import fs from 'fs/promises';
import fg from 'fast-glob';
import _ from 'lodash';

import { AttachmentContent, Content, GroupContent } from './content';
import { TFunction } from '../../types';
import { ILlmSkill } from './llm';

import env from '../env';

const renderFilesTree = (tree: Record<string, any>, indent = 0): string =>
  Object
    .keys(tree)
    .map((key) => {
      const children = renderFilesTree(tree[key], indent + 2);
      return ' '.repeat(indent) + key + (children ? `\n${children}` : '');
    })
    .join('\n');

export class Project {
  public cwd: string = this.provided.cwd ?? process.cwd();

  public sources: {
    skills: Record<string, ILlmSkill>;

    ignore: string[];
    files: string[];

    editorconfig?: string;
  } = this.provided.sources;

  public content = {
    /** Renders `.editorconfig` content */
    editorconfig: (): Content => {
      if (!this.sources.editorconfig?.length) {
        return GroupContent.build([]);
      }

      return AttachmentContent.build({
        title: 'Editor config file content',

        extension: '.editorconfig',
        content: this.sources.editorconfig,
      });
    },

    /** Renders project files tree */
    tree: (patterns?: string[]): Content => {
      const filtered = this.files.glob(patterns);
      if (!filtered.length) {
        return GroupContent.build([]);
      }

      const tree: Record<string, any> = {};

      filtered.forEach((path: string) => {
        let current = tree;

        path.split('/').forEach((part: string) => {
          if (!current[part]) {
            current[part] = {};
          }

          current = current[part];
        });
      });

      return AttachmentContent.build({
        title: 'Project files tree',
        content: renderFilesTree(tree),
      });
    },
  } satisfies Record<string, TFunction<Content, any[]>>;

  public files = {
    /** Returns glob result of the project files */
    glob: (patterns?: string[]): string[] => {
      if (!patterns?.length) {
        return this.sources.files;
      }

      const parsed = patterns.map((pattern) =>
        pattern === '.'
          ? '**'
          : pattern.startsWith('./')
            ? pattern.slice(2)
            : pattern
      );

      return this.sources.files.filter(
        (file) => parsed.some((pattern) => minimatch(file, pattern, { matchBase: true }))
      );
    },

    /** Adds path to the project files */
    add: (path: string): void => {
      if (!this.sources.files.includes(path)) {
        this.sources.files.push(path);
      }
    },

    /** Removes file or directory from the project files */
    rm: (path: string): void => {
      this.sources.files = this.sources.files.filter((file) => !file.startsWith(path));
    },
  };

  constructor(private provided: Pick<Project, 'sources'> & Partial<Pick<Project, 'cwd'>>) {}

  static async build(options?: Partial<Pick<Project, 'cwd'>>): Promise<Project> {
    const cwd = options?.cwd ?? process.cwd();

    const editorconfig = await fs.readFile(path.join(cwd, '.editorconfig'), 'utf8').catch(() => '');
    const gitignore = await fs.readFile(path.join(cwd, '.gitignore'), 'utf8').catch(() => '');

    const ignore = gitignore
      .split('\n')
      .map((segment) => segment.trim().replace(/^\//, '').replace(/\/$/, '/**'))
      .filter((segment) => segment.length && !segment.startsWith('!'));

    const files = await fg(['**/*.{ts,js,json,md}'], { cwd, ignore });

    const skills = await Promise.all(
      (await fg(['**/*.md'], { cwd: env.dirs.skills }).catch<string[]>(() => [])).map(
        async (location): Promise<ILlmSkill> => {
          const raw = await fs.readFile(path.join(env.dirs.skills, location), 'utf8').catch(() => '');
          const { data, content } = matter(raw)

          return {
            name: data.name,
            description: data.description,

            content: content.trim(),
          };
        }
      )
    );

    const source = new Project({
      cwd,

      sources: {
        editorconfig,
        ignore,
        files,

        skills: skills.reduce((acc, skill) => _.set(acc, skill.name, skill), {}),
      },
    });

    return source;
  }
}
