import path from 'path';

/** Checks for path pattern restrictions like `.env`, `../` and etc */
export const checkPatternIsRestricted = (pattern: string): boolean => {
  if (pattern.includes('..')) {
    return false;
  }
  if (pattern.startsWith(path.sep)) {
    return false;
  }
  if (pattern.startsWith('/')) {
    return false;
  }
  if (pattern.startsWith('~')) {
    return false;
  }
  if (pattern.endsWith('.env')) {
    return false;
  }

  return true;
}
