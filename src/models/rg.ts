import path from 'path';
import fs from 'fs/promises';
import z from 'zod/v3';

import { lock } from 'proper-lockfile';

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
  /** Arbitrary data from `rg --json` (`bytes` is base64 and used when data is not valid UTF-8) */
  const data = z
    .object({
      text: z.string().optional(),
      bytes: z.string().optional(),
    })
    .transform((value) => ({
      text: value.text ?? Buffer.from(value.bytes ?? '', 'base64').toString('utf8'),
    }));

  const match = z.object({
    type: z.literal('match'),

    data: z.object({
      line_number: z.number(),
      absolute_offset: z.number(),

      path: data,
      lines: data,

      submatches: z.array(
        z.object({
          match: data,

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

  constructor(protected provided?: { cwd?: string }) {}

  /** Searches pattern (`errors` contains non-fatal errors like missing paths when some matches were found) */
  public async exec(pattern: string, options?: {
    include?: string[];
    exclude?: string[];

    limit?: number;
    paths?: string[];
  }): Promise<{
    matches: z.infer<typeof schemas.match>['data'][];
    errors: string[];
  }> {
    const argv0 = await this.provide();

    const bash = Bash.build({ argv0, cwd: this.provided?.cwd });
    const args = ['--json', '--hidden'];

    if (options?.include) {
      for (const pattern of options.include) {
        args.push(`--glob=${pattern}`);
      }
    }

    if (options?.exclude) {
      for (const pattern of options.exclude.concat('.git/**')) {
        args.push(`--glob=!${pattern}`);
      }
    }

    if (options?.limit) {
      args.push(`--max-count=${options.limit}`);
    }

    const result = await bash.exec(args.concat('--regexp', pattern, '--', options?.paths ?? []));
    if (result.status === 'ERROR') {
      // Code 1 means no matches
      if (result.error.code === 1) {
        return { matches: [], errors: [] };
      }

      // Code 2 with matches means partial errors (eg. one of paths is missing), otherwise it's a real error
      const matches = result.error.code === 2 ? this.parse(result.error.stdout, options?.limit) : [];
      if (!matches.length) {
        throw result.error;
      }

      return {
        matches,
        errors: result.error.stderr.split(/\r?\n/).filter(Boolean),
      };
    }

    return {
      matches: this.parse(result.stdout, options?.limit),
      errors: [],
    };
  }

  private parse(stdout: string, limit?: number): z.infer<typeof schemas.match>['data'][] {
    return stdout
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .map((parsed) => schemas.result.parse(parsed))
      .filter((record): record is z.infer<typeof schemas.match> => record.type === 'match')
      .slice(0, limit)
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

    if (await this.exists(bin)) {
      this.argv0 = bin;
      return bin;
    }

    await fs.mkdir(dir, { recursive: true });

    // Concurrent calls (parallel tool calls or several processes) share the same `.bin` dir
    const release = await lock(dir, {
      stale: 10000,
      update: 1000,
      retries: { retries: 120, factor: 1, minTimeout: 500, maxTimeout: 500 },
    });

    try {
      if (!(await this.exists(bin))) {
        await this.install(dir, bin);
      }
    } finally {
      await release();
    }

    this.argv0 = bin;
    return bin;
  }

  /** Downloads and extracts `rg` into `dir` (should be called under lock) */
  private async install(dir: string, bin: string): Promise<void> {
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

    try {
      const bash = new Bash({ cwd: dir });
      const tarArgs = config.extension === 'tar.gz'
        ? ['-xzf', filename, '--strip-components=1']
        // Modern windows has bsdtar which is able to extract zip archives
        : ['-xf', filename, '--strip-components=1'];

      if (config.extension === 'tar.gz') {
        tarArgs.push(...(process.platform === 'darwin' ? ['--include=*/rg'] : ['--wildcards', '*/rg']));
      }

      const result = await bash.exec(['tar', ...tarArgs]);
      if (result.status === 'ERROR') {
        throw result.error;
      }
    } finally {
      await fs.rm(archive, { force: true });
    }

    if (process.platform !== 'win32') {
      await fs.chmod(bin, 0o755);
    }
  }

  private async exists(location: string): Promise<boolean> {
    return fs.stat(location).then(() => true, () => false);
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
