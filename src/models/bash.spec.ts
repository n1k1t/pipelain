import { Bash } from './bash';

it('exec should keep stdout in error when command exits with non-zero code', async () => {
  const result = await Bash.build().exec(['sh', '-c', 'echo out; echo err >&2; exit 2']);

  expect(result.status).toBe('ERROR');
  expect(result.status === 'ERROR' && result.error.stdout).toBe('out\n');
  expect(result.status === 'ERROR' && result.error.code).toBe(2);
});
