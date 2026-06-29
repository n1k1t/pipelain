import json2md from 'json2md';

import { IJsonContent } from '../types';
import { Content } from './model';
import { cast } from '../../../utils';

export class RulesContent extends Content<'rules', string[]> {
  public render(): string {
    return json2md(
      cast<IJsonContent>({ ol: this.payload })
    );
  }

  static build(payload: RulesContent['TSchema']): RulesContent {
    return new RulesContent('rules', payload);
  }
}
