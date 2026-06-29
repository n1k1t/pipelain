import json2md from 'json2md';

import { IJsonContent } from '../types';
import { Content } from './model';
import { cast } from '../../../utils';

export class SourcesContent extends Content<'sources', {
  path: string;
  title?: string;
}[]> {
  public render(): string {
    return json2md(
      cast<IJsonContent>({ ol: this.serialize() })
    );
  }

  public serialize(): string[] {
    return this.payload.map(
      (line) => line.title ? `\`${line.path}\`: ${line.title}` : `\`${line.path}\``
    );
  }

  static build(payload: SourcesContent['TSchema']): SourcesContent {
    return new SourcesContent('sources', payload);
  }
}
