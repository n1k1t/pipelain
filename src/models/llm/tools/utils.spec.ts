import { checkPatternIsRestricted, resolvePath } from './utils';

it('resolvePath should resolve absolute paths inside project directory into relative ones', () => {
  expect(resolvePath('/project/src/index.ts', '/project')).toBe('src/index.ts');
  expect(resolvePath('/project/src/', '/project/')).toBe('src');
  expect(resolvePath('/project', '/project')).toBe('.');
});

it('resolvePath should keep relative paths and absolute paths out of project directory', () => {
  expect(resolvePath('src/index.ts', '/project')).toBe('src/index.ts');
  expect(resolvePath('/etc/passwd', '/project')).toBe('/etc/passwd');
  expect(resolvePath('/project-other/index.ts', '/project')).toBe('/project-other/index.ts');
  expect(resolvePath('/project/../etc/passwd', '/project')).toBe('/project/../etc/passwd');
});

it('checkPatternIsRestricted should restrict paths out of project scope', () => {
  expect(checkPatternIsRestricted(resolvePath('/project/src/index.ts', '/project'))).toBe(true);
  expect(checkPatternIsRestricted(resolvePath('/etc/passwd', '/project'))).toBe(false);
  expect(checkPatternIsRestricted(resolvePath('/project/.env', '/project'))).toBe(false);
});
