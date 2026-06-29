import json2md from 'json2md';

import { IJsonContent } from '../types';
import { Content } from './model';
import { cast } from '../../../utils';

export class ArticleContent extends Content<'article', {
  title: string;
  content: IJsonContent[];

  /** Markdown tag for the title */
  tag?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'b';
}> {
  public render(): string {
    const tag = this.payload.tag ?? 'h3';

    return json2md(
      cast<IJsonContent[]>([{ [tag]: this.payload.title }, ...this.payload.content])
    ).trim();
  }

  static build(payload: ArticleContent['TSchema']): ArticleContent {
    return new ArticleContent('article', payload);
  }
}
