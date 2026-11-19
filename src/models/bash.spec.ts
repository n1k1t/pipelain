import { Bash } from './bash';

it('exec should keep stdout in error when command exits with non-zero code', async () => {
  const result = await Bash.build().exec(['sh', '-c', 'echo out; echo err >&2; exit 2']);

  expect(result.status).toBe('ERROR');
  expect(result.status === 'ERROR' && result.error.stdout).toBe('out\n');
  expect(result.status === 'ERROR' && result.error.code).toBe(2);
});

it('exec should write stdin into the process', async () => {
  const result = await Bash.build().exec(['cat'], { stdin: 'hello' });
  expect(result).toEqual({ status: 'OK', stdout: 'hello' });
});

it('exec should pass stdout chunks into onStdout listener', async () => {
  const chunks: string[] = [];
  const result = await Bash.build().exec(['sh', '-c', 'echo a; echo b'], { onStdout: (chunk) => chunks.push(chunk) });

  expect(result.status).toBe('OK');
  expect(chunks.join('')).toBe('a\nb\n');
});

it('exec should resolve error when signal is aborted', async () => {
  const controller = new AbortController();
  const promise = Bash.build().exec(['sleep', '5'], { signal: controller.signal });

  controller.abort();
  const result = await promise;

  expect(result.status).toBe('ERROR');
});
