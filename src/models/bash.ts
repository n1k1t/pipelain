import parseArgsStringToArgv from 'string-argv';
import _ from 'lodash';

import { spawn, SpawnOptions } from 'child_process';

export type TBashExecuted =
  | { status: 'OK'; stdout: string }
  | { status: 'ERROR'; error: BashExecError };

export class BashExecError extends Error {
  constructor(
    public cmd: string,
    public code: number,
    public stderr: string,
    public source?: Error
  ) {
    super(
      source?.message ??
      stderr.split('\n').find((line) => line.toLowerCase().includes('error')) ??
      'Bash execution error'
    );
  }
}

export class Bash {
  constructor(private provided?: {
    /** Command prefix like `npm` */
    argv0?: string;

    env?: Record<string, string>;
    cwd?: string;
  }) {}

  /** Executes bash commands (resolves `stderr` into `{ status: 'ERROR', error: BashExecError(...) }`) */
  public async exec(cmd: string): Promise<TBashExecuted> {
    const options: SpawnOptions = {
      cwd: this.provided?.cwd ?? process.cwd(),
      env: this.provided?.env ?? process.env,

      stdio: ['ignore', 'pipe', 'pipe'],
    };

    const args = parseArgsStringToArgv(this.provided?.argv0 ? `${this.provided.argv0} ${cmd}` : cmd);
    const spawned = spawn(args[0], args.slice(1), options);

    const stdout: string[] = [];
    const stderr: string[] = [];

    return new Promise<TBashExecuted>((resolve) => {
      spawned.once('error', (error) =>
        resolve({
          status: 'ERROR',
          error: new BashExecError(args.join(' '), -1, (stderr.length ? stderr : stdout).join('').trim(), error),
        })
      );

      spawned.once('exit', (code) =>
        !code
          ? resolve({
            status: 'OK',
            stdout: stdout.join('')
          })
          : resolve({
            status: 'ERROR',
            error: new BashExecError(args.join(' '), code, (stderr.length ? stderr : stdout).join('').trim()),
          })
      );

      spawned.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString('utf8')));
      spawned.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk.toString('utf8')));
    });
  }

  static build(provided?: Bash['provided']): Bash {
    return new Bash(provided);
  }
}
