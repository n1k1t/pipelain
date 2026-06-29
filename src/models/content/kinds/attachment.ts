import _ from 'lodash';

import { SetPartialKeys } from '../../../../types';
import { Content } from './model';

export class AttachmentContent extends Content<'attachment', {
  content: unknown;
  title: string;
  key: string;

  /** File extension with dot (`.json`, `.md` and etc) */
  extension?: string;
}> {
  public render(): string {
    return _.isObject(this.payload.content)
      ? JSON.stringify(this.payload.content, null, 2)
      : String(this.payload.content);
  }

  static build(
    payload: SetPartialKeys<AttachmentContent['TSchema'], 'key'>
  ): AttachmentContent {
    const extension = payload.extension ?? (_.isObject(payload.content) ? '.json' : undefined);

    return new AttachmentContent('attachment', {
      extension,

      content: payload.content,
      title: payload.title,
      key: payload.key ?? `${_.kebabCase(payload.title).toLowerCase()}${extension ?? ''}`,
    });
  }
}
