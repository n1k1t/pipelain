import { Bash, BashExecError } from './bash';
import { Rg } from './rg';

const renderMatch = (path: object, lines: object): string => JSON.stringify({
  type: 'match',

  data: {
    path,
    lines,

    line_number: 1,
    absolute_offset: 0,
    submatches: [],
  },
});

const build = (): Rg => {
  const rg = Rg.build({ cwd: '/project' });

  jest.spyOn(rg as any, 'provide').mockResolvedValue('rg');
  return rg;
};

afterEach(() => jest.restoreAllMocks());

it('exec should pass every path as separate argument after "--"', async () => {
  const spy = jest.spyOn(Bash.prototype, 'exec').mockResolvedValue({ status: 'OK', stdout: '' });
  await build().exec('query', { paths: ['src/a', 'src/b c'] });

  expect(spy.mock.calls[0][0]).toEqual(['--json', '--hidden', '--regexp', 'query', '--', 'src/a', 'src/b c']);
});

it('exec should return matches with errors when rg exits with code 2 and has matches', async () => {
  const stdout = renderMatch({ text: 'src/a.ts' }, { text: 'query()' });

  jest.spyOn(Bash.prototype, 'exec').mockResolvedValue({
    status: 'ERROR',
    error: new BashExecError('rg', 2, 'rg: missing: No such file or directory (os error 2)', stdout),
  });

  const result = await build().exec('query', { paths: ['src', 'missing'] });

  expect(result.matches.map((match) => match.path.text)).toEqual(['src/a.ts']);
  expect(result.errors).toEqual(['rg: missing: No such file or directory (os error 2)']);
});

it('exec should throw when rg exits with code 2 without matches', async () => {
  const error = new BashExecError('rg', 2, 'rg: missing: No such file or directory (os error 2)', '');
  jest.spyOn(Bash.prototype, 'exec').mockResolvedValue({ status: 'ERROR', error });

  await expect(build().exec('query', { paths: ['missing'] })).rejects.toBe(error);
});

it('exec should return empty result when rg exits with code 1', async () => {
  jest.spyOn(Bash.prototype, 'exec').mockResolvedValue({
    status: 'ERROR',
    error: new BashExecError('rg', 1, '', ''),
  });

  await expect(build().exec('query')).resolves.toEqual({ matches: [], errors: [] });
});

it('exec should decode non UTF-8 data provided as bytes', async () => {
  const stdout = renderMatch(
    { bytes: Buffer.from('src/b.ts').toString('base64') },
    { bytes: Buffer.from([0x61, 0xff, 0x20, 0x71]).toString('base64') }
  );

  jest.spyOn(Bash.prototype, 'exec').mockResolvedValue({ status: 'OK', stdout });
  const result = await build().exec('q');

  expect(result.matches[0].path.text).toBe('src/b.ts');
  expect(result.matches[0].lines.text).toBe('a� q');
});
