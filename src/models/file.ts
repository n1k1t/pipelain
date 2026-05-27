import path from 'path';
import fs from 'fs/promises';

export interface IFileOptions {
  cwd?: string;

  /** Restricts file building based on provided `state` option */
  strict?: boolean;

  /** Expected state of the file (works only on `strict` option provided as `true`) */
  state?: 'new' | 'existent';
}

export class FileReplaceError extends Error {
  constructor(public source: string, reason: string) {
    super(`Cannot replace content in the file. Reason: "${reason}". Provided source lines: "${source}"`);
  }
}

export class FileBuildError extends Error {
  constructor(reason: string) {
    super(`Cannot build file. Reason: ${reason}`);
  }
}

export class File {
  public path: string = this.provided.path;

  public dir: string = path.dirname(this.path);
  public cwd: string = this.provided.cwd;

  public content: string = this.provided.content;
  public lang: string = this.provided.lang;

  public options?: IFileOptions = this.provided.options;

  constructor(private provided: Pick<File, 'cwd' | 'lang' | 'path' | 'content' | 'options'>) {}

  public append(content: string): this {
    if (!content.length) {
      return this;
    }

    this.content = `${this.content}\n${content}`;
    return this;
  }

  public prepend(content: string): this {
    if (!content.length) {
      return this;
    }

    this.content = `${content}\n${this.content}`;
    return this;
  }

  public replace(source: string, target: string, options?: Pick<IFileOptions, 'strict'>): this {
    const segments = this.content.split(source);

    if (this.options?.strict ?? options?.strict) {
      if (segments.length === 1) {
        throw new FileReplaceError(source, 'File does not have provided lines of content');
      }

      if (segments.length > 2) {
        throw new FileReplaceError(source, [
          'File has more than one potential replacement source',
          'Try to capture more lines of the source file',
        ].join('. '));
      }
    }

    this.content = segments.join(target);
    return this;
  }

  /** Writes content to file */
  public async write(content?: string): Promise<void> {
    if (content !== undefined) {
      this.content = content;
    }

    await fs.mkdir(path.join(this.cwd, this.dir), { recursive: true });
    await fs.writeFile(path.join(this.cwd, this.path), this.content, 'utf8');
  }

  /** Refreshes and stores source content from file */
  public async refresh(): Promise<void> {
    this.content = await fs.readFile(path.join(this.cwd, this.path), 'utf8');
  }

  public async remove(): Promise<void> {
    await fs.rm(path.join(this.cwd, this.path));
  }

  static async build(location: string | string[], options?: IFileOptions): Promise<File> {
    const target = typeof location === 'string' ? location : path.join(...location);
    const cwd = options?.cwd ?? process.cwd();

    const stats = await fs.stat(path.join(cwd, target)).catch((): null => null);
    if (stats?.isDirectory()) {
      throw new FileBuildError('Cannot read directory');
    }

    if (options?.strict) {
      if (!stats && options.state === 'existent') {
        throw new FileBuildError('File is not exists');
      }
      if (stats && options.state === 'new') {
        throw new FileBuildError('File already exists');
      }
    }

    return new File({
      cwd,
      path: target,

      lang: path.extname(target).substring(1),
      content: stats ? await fs.readFile(path.join(cwd, target), 'utf8') : '',
    });
  }
}
