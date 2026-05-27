import json2md, { DataObject } from 'json2md';

import { Content } from './model';
import { cast } from '../../../utils';

export class SourcesContent extends Content<'sources', {
  location: string;
  title?: string;
}[]> {
  public render(): string {
    return json2md(
      cast<DataObject>({ ol: this.serialize() })
    );
  }

  public serialize(): string[] {
    return this.payload.map(
      (line) => line.title ? `\`${line.location}\`: ${line.title}` : `\`${line.location}\``
    );
  }

  static build(payload: SourcesContent['TSchema']): SourcesContent {
    return new SourcesContent('sources', payload);
  }
}
