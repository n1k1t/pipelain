import path from 'path';

/**
 * Resolves absolute path into the path relative to the project directory
 * Absolute paths out of the project directory and relative paths are returned as is
 */
export const resolvePath = (location: string, cwd: string): string => {
  if (!path.isAbsolute(location)) {
    return location;
  }

  const relative = path.relative(path.resolve(cwd), location);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return location;
  }

  return relative || '.';
};

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
