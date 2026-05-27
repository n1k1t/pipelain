import path from 'path';
import fs from 'fs/promises';
import fg from 'fast-glob';

import { DataObject } from 'json2md';

import { Content, TContentType } from './kinds/model';
import { SetPartialKeys } from '../../../types';
import { Project } from '../project';
import { File } from '../file';

import * as kinds from './kinds';

type TContentKind<K extends TContentType> = {
  attachment: kinds.AttachmentContent;
  sources: kinds.SourcesContent;
  article: kinds.ArticleContent;
  tasks: kinds.TasksContent;
  rules: kinds.RulesContent;
  group: kinds.GroupContent;
  plain: kinds.PlainContent;
}[K];

export class ContentFactory {
  constructor(private project?: Project) {}

  /** Creates `## Article` with nested content */
  public article(title: string, content: DataObject[]): kinds.ArticleContent {
    return kinds.ArticleContent.build({ title, content });
  }

  /** Creates rules list */
  public rules(list: string[]): kinds.RulesContent {
    return kinds.RulesContent.build(list);
  }

  /** Creates tasks list */
  public tasks(list: string[]): kinds.TasksContent {
    return kinds.TasksContent.build(list);
  }

  /** Creates sources links list */
  public sources(list: kinds.SourcesContent['TSchema']): kinds.SourcesContent {
    return kinds.SourcesContent.build(list);
  }

  /** Creates plain markdown */
  public plain(payload: string): kinds.PlainContent {
    return kinds.PlainContent.build(payload);
  }

  public attachment(
    title: string,
    payload: Omit<SetPartialKeys<kinds.AttachmentContent['TSchema'], 'extension' | 'path' | 'isVirtual'>, 'title'>
  ): kinds.AttachmentContent {
    return kinds.AttachmentContent.build({ title, ...payload, isVirtual: true });
  }

  public async file(title: string, location: string | string[]): Promise<kinds.AttachmentContent> {
    const file = await File.build(location, { cwd: this.project?.cwd });

    return kinds.AttachmentContent.build({
      title,

      content: file.content,
      path: file.path,
    });
  }

  /** Reads files by pattern and creates attachments for each file */
  public async glob(title: string, pattern: string): Promise<kinds.GroupContent> {
    const paths = await fg(pattern);

    const files = await Promise.all(
      paths.map(async (location) => ({
        extension: path.extname(location),
        path: location,

        content: await fs.readFile(location, 'utf8'),
      }))
    );

    return kinds.GroupContent.build(
      files.map((file) =>
        kinds.AttachmentContent.build({
          title,

          extension: file.extension,
          content: file.content,
          path: file.path,
        })
      )
    );
  }

  static build(project?: Project): ContentFactory {
    return new ContentFactory(project);
  }

  static is<K extends TContentType>(type: K, content: unknown): content is TContentKind<K> {
    return content instanceof Content && content.type === type;
  }
}
