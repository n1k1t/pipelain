import json2md from 'json2md';

import { Content, TContentLocation } from './model';
import { IJsonContent } from '../types';
import { cast } from '../../../utils';

export class ArticleContent extends Content<'article', {
  title: string;
  content: IJsonContent[];

  /** Markdown tag for the title */
  tag?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'b';
}> {
  public location: TContentLocation = 'system';

  public render(): string {
    const tag = this.payload.tag ?? 'h3';

    return json2md(
      cast<IJsonContent[]>([{ [tag]: this.payload.title }, ...this.payload.content])
    ).trim();
  }

  public clone(): ArticleContent {
    return ArticleContent.build(this.payload);
  }

  static build(payload: ArticleContent['TSchema']): ArticleContent {
    return new ArticleContent('article', payload);
  }
}
