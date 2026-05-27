import path from 'path';
import fs from 'fs/promises';
import z from 'zod/v3';

import { Bash } from './bash';

const platforms = <const>{
  'arm64-darwin': { platform: 'aarch64-apple-darwin', extension: 'tar.gz' },
  'arm64-linux': { platform: 'aarch64-unknown-linux-gnu', extension: 'tar.gz' },
  'arm64-win32': { platform: 'aarch64-pc-windows-msvc', extension: 'zip' },
  'x64-darwin': { platform: 'x86_64-apple-darwin', extension: 'tar.gz' },
  'x64-linux': { platform: 'x86_64-unknown-linux-musl', extension: 'tar.gz' },
  'x64-win32': { platform: 'x86_64-pc-windows-msvc', extension: 'zip' },
};

const schemas = (() => {
  const match = z.object({
    type: z.literal('match'),

    data: z.object({
      line_number: z.number(),
      absolute_offset: z.number(),

      path: z.object({
        text: z.string(),
      }),

      lines: z.object({
        text: z.string(),
      }),

      submatches: z.array(
        z.object({
          match: z.object({
            text: z.string(),
          }),

          start: z.number(),
          end: z.number(),
        }),
      ),
    }),
  });

  return {
    match,

    result: z.union([
      match,

      z.object({ type: z.literal('begin') }),
      z.object({ type: z.literal('end') }),
      z.object({ type: z.literal('summary') }),
    ]),
  };
})();

export class Rg {
  private argv0: string | null = null;

  constructor(private provided?: { cwd?: string }) {}

  public async exec(pattern: string, options?: {
    include?: string[];
    exclude?: string[];

    limit?: number;
    path?: string;
  }): Promise<z.infer<typeof schemas.match>['data'][]> {
    const argv0 = await this.provide();

    const bash = Bash.build({ argv0, cwd: this.provided?.cwd });
    const args = ['--json', '--hidden'];

    if (options?.include) {
      for (const pattern of options.include) {
        args.push(`--glob='${pattern}'`);
      }
    }

    if (options?.exclude) {
      for (const pattern of options.exclude.concat(['.git/**'])) {
        args.push(`--glob=!'${pattern}'`);
      }
    }

    if (options?.limit) {
      args.push(`--max-count=${options.limit}`);
    }

    const result = await bash.exec(args.concat([`'${pattern}'`], options?.path ? [options.path] : []).join(' '));
    if (result.status === 'ERROR') {
      return [];
    }

    return result.stdout
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .map((parsed) => schemas.result.parse(parsed))
      .filter((record): record is z.infer<typeof schemas.match> => record.type === 'match')
      .slice(0, options?.limit)
      .map((record) => record.data);
  }

  /** Installs and returns argv0 for `rg` */
  private async provide(): Promise<string> {
    if (this.argv0) {
      return this.argv0;
    }

    const existent = await this.which('rg');
    if (existent) {
      this.argv0 = existent;
      return existent;
    }

    const dir = path.join(__dirname, '../../', '.bin');
    const bin = path.join(dir, `rg${process.platform === 'win32' ? '.exe' : ''}`);

    if ((await fs.stat(bin).catch((): null => null))) {
      this.argv0 = bin;
      return bin;
    }

    await fs.mkdir(dir, { recursive: true });

    const platform = <keyof typeof platforms>`${process.arch}-${process.platform}`;
    const config = platforms[platform];

    if (!config) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    const version = '14.1.1';
    const filename = `ripgrep-${version}-${config.platform}.${config.extension}`;
    const url = `https://github.com/BurntSushi/ripgrep/releases/download/${version}/${filename}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download ripgrep: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const archive = path.join(dir, filename);

    await fs.writeFile(archive, Buffer.from(buffer));

    if (config.extension === 'tar.gz') {
      const bash = new Bash({ cwd: dir });
      const tarArgs = ['-xzf', filename, '--strip-components=1'];

      if (process.platform === 'darwin') {
        tarArgs.push('--include=*/rg');
      } else {
        tarArgs.push('--wildcards', '*/rg');
      }

      await bash.exec(`tar ${tarArgs.join(' ')}`);
    } else {
      // Basic zip extraction for windows if needed, but here we assume tar is available or use a simple approach
      // For simplicity in this environment, we'll try to use powershell or similar if on windows,
      // but the example used a zip library which is not in dependencies.
      // Given the environment, we'll stick to tar which is usually available on modern windows too.
      const bash = new Bash({ cwd: dir });
      await bash.exec(`tar -xf ${filename} --strip-components=1`);
    }

    await fs.unlink(archive);

    if (process.platform !== 'win32') {
      await fs.chmod(bin, 0o755);
    }

    this.argv0 = bin;
    return bin;
  }

  private async which(cmd: string): Promise<string | null> {
    const bash = new Bash({ argv0: 'which' });
    const result = await bash.exec(cmd);

    return result.status === 'OK' ? result.stdout.trim() : null;
  }

  static build(provided?: Rg['provided']): Rg {
    return new Rg(provided);
  }
}
