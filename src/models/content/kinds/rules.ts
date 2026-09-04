import json2md from 'json2md';

import { Content, TContentLocation } from './model';
import { IJsonContent } from '../types';
import { cast } from '../../../utils';

export class RulesContent extends Content<'rules', string[]> {
  public location: TContentLocation = 'system';

  public render(): string {
    return json2md(
      cast<IJsonContent>({ ol: this.payload })
    );
  }

  public clone(): RulesContent {
    return RulesContent.build(this.payload);
  }

  static build(payload: RulesContent['TSchema']): RulesContent {
    return new RulesContent('rules', payload);
  }
}
