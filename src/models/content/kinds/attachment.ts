import path from 'path';
import _ from 'lodash';

import { SetPartialKeys } from '../../../../types';
import { Content } from './model';

export class AttachmentContent extends Content<'attachment', {
  content: unknown;
  title: string;
  path: string;

  /** File extension with dot (`.json`, `.md` and etc) */
  extension: string;
  isVirtual: boolean;
}> {
  public render(): string {
    return _.isObject(this.payload.content)
      ? JSON.stringify(this.payload.content, null, 2)
      : String(this.payload.content);
  }

  static build(
    payload: SetPartialKeys<AttachmentContent['TSchema'], 'extension' | 'path' | 'isVirtual'>
  ): AttachmentContent {
    const extension = payload.extension ?? (
      payload.path
        ? path.extname(payload.path)
        : _.isObject(payload.content) ? '.json' : '.txt'
    );

    return new AttachmentContent('attachment', {
      extension,

      content: payload.content,
      title: payload.title,

      path: payload.path ?? `${_.kebabCase(payload.title).toLowerCase()}${extension}`,
      isVirtual: payload.isVirtual ?? !Boolean(payload.path),
    });
  }
}
