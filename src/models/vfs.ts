import uuid from 'uuid';
import _ from 'lodash';

import { SetPartialKeys } from '../../types';

export interface IVirtualFile {
  title: string;
  path: string;

  content: string;
}

export class VirtualFileSystem extends Map<string, IVirtualFile> {
  public register(provided: SetPartialKeys<IVirtualFile, 'path' | 'title'>): this {
    const path = `__vfs__/${provided.path ?? (provided.title ? _.kebabCase(provided.title) : uuid.v4())}`;

    return this.set(path, {
      path,

      title: `${provided.title ?? 'Untitled attachment'} (virtual file)`,
      content: provided.content,
    });
  }

  static build(): VirtualFileSystem {
    return new VirtualFileSystem();
  }
}
