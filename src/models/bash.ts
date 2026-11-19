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
    public stdout: string = '',
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
  constructor(protected provided?: {
    /** Command prefix like `npm` */
    argv0?: string;

    env?: Record<string, string | undefined>;
    cwd?: string;
  }) {}

  /**
   * Executes bash commands (resolves `stderr` into `{ status: 'ERROR', error: BashExecError(...) }`)
   * Pass `cmd` as array to spawn arguments as is (without string parsing)
   */
  public async exec(cmd: string | string[], parameters?: {
    /** Content to write into `stdin` of the process */
    stdin?: string;

    /** Signal to kill the process (resolves into `{ status: 'ERROR' }`) */
    signal?: AbortSignal;

    /** Listener of `stdout` chunks to handle output while the process is running */
    onStdout?: (chunk: string) => void;
  }): Promise<TBashExecuted> {
    const options: SpawnOptions = {
      cwd: this.provided?.cwd ?? process.cwd(),
      env: this.provided?.env ?? process.env,

      stdio: [parameters?.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],

      ...(parameters?.signal && { signal: parameters.signal }),
    };

    const args = Array.isArray(cmd)
      ? (this.provided?.argv0 ? [this.provided.argv0, ...cmd] : cmd)
      : parseArgsStringToArgv(this.provided?.argv0 ? `${this.provided.argv0} ${cmd}` : cmd);

    const spawned = spawn(args[0], args.slice(1), options);
    const stdout: string[] = [];
    const stderr: string[] = [];

    return new Promise<TBashExecuted>((resolve) => {
      spawned.once('error', (error) =>
        resolve({
          status: 'ERROR',
          error: new BashExecError(
            args.join(' '),
            -1,
            (stderr.length ? stderr : stdout).join('').trim(),
            stdout.join(''),
            error
          ),
        })
      );

      spawned.once('close', (code, signal) =>
        !code && !signal
          ? resolve({
            status: 'OK',
            stdout: stdout.join('')
          })
          : resolve({
            status: 'ERROR',
            error: new BashExecError(
              args.join(' '),
              code ?? -1,
              (stderr.length ? stderr : stdout).join('').trim() || `Killed by signal [${signal}]`,
              stdout.join('')
            ),
          })
      );

      spawned.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString('utf8')));
      spawned.stdout?.on('data', (chunk: Buffer) => {
        const content = chunk.toString('utf8');

        stdout.push(content);
        parameters?.onStdout?.(content);
      });

      if (parameters?.stdin !== undefined) {
        spawned.stdin?.on('error', () => undefined);
        spawned.stdin?.end(parameters.stdin);
      }
    });
  }

  static build(provided?: Bash['provided']): Bash {
    return new Bash(provided);
  }
}
