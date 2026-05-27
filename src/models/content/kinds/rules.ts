import json2md, { DataObject } from 'json2md';

import { Content } from './model';
import { cast } from '../../../utils';

export class RulesContent extends Content<'rules', string[]> {
  public render(): string {
    return json2md(
      cast<DataObject>({ ol: this.payload })
    );
  }

  static build(payload: RulesContent['TSchema']): RulesContent {
    return new RulesContent('rules', payload);
  }
}
