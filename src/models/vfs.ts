import uuid from 'uuid';
import _ from 'lodash';

import { SetPartialKeys } from '../../types';

export interface IVirtualFile {
  title: string;
  key: string;

  content: string;
}

export class VirtualFileSystem extends Map<string, IVirtualFile> {
  public register(provided: SetPartialKeys<IVirtualFile, 'key' | 'title'>): this {
    const key = `${provided.key ?? (provided.title ? _.kebabCase(provided.title) : uuid.v4())}`;

    return this.set(key, {
      key,

      title: provided.title ?? 'Untitled attachment',
      content: provided.content,
    });
  }

  static build(): VirtualFileSystem {
    return new VirtualFileSystem();
  }
}
