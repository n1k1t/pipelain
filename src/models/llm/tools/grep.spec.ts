import grep from './grep';
import { Rg } from '../../rg';

const compile = () => grep.compile(<any>{
  extend: () => ({
    context: {
      project: {
        cwd: '/project',
        sources: { ignore: [] },
      },
    },
  }),
});

const execute = (input: { pattern: string; path?: string }): Promise<string> => <Promise<string>>compile().execute!(input, <any>{});

afterEach(() => jest.restoreAllMocks());

it('should split path by spaces into multiple paths', async () => {
  const spy = jest.spyOn(Rg.prototype, 'exec').mockResolvedValue({ matches: [], errors: [] });
  await execute({ pattern: 'query', path: 'src/helpers/ai src/helpers/git.ts "src/with space"' });

  expect(spy.mock.calls[0][1]?.paths).toEqual(['src/helpers/ai', 'src/helpers/git.ts', 'src/with space']);
});

it('should reject when any of paths is out of project scope', async () => {
  const spy = jest.spyOn(Rg.prototype, 'exec');

  await expect(execute({ pattern: 'query', path: 'src /etc' })).rejects.toThrow('out of scope');
  expect(spy).not.toHaveBeenCalled();
});

it('should render errors after matches', async () => {
  jest.spyOn(Rg.prototype, 'exec').mockResolvedValue({
    matches: [<any>{ path: { text: 'src/a.ts' }, lines: { text: 'query()' }, line_number: 3 }],
    errors: ['rg: missing: No such file or directory (os error 2)'],
  });

  await expect(execute({ pattern: 'query', path: 'src missing' })).resolves.toBe(
    'src/a.ts:3: query()\n\nErrors:\nrg: missing: No such file or directory (os error 2)'
  );
});
