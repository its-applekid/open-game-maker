import path from 'node:path';

export class UnsafePathError extends Error {
  readonly path: string;

  constructor(input: string, detail: string) {
    super(`unsafe path: ${detail}`);
    this.name = 'UnsafePathError';
    this.path = input;
  }
}

export function normalizeCommitPath(input: string): string {
  if (input.length === 0) throw new UnsafePathError(input, 'empty');
  if (input.includes('\0')) throw new UnsafePathError(input, 'contains NUL');
  if (input.includes('\\')) throw new UnsafePathError(input, 'contains backslash');
  if (input.startsWith('/')) throw new UnsafePathError(input, 'absolute');

  const segments = input.split('/');
  if (segments.includes('..')) throw new UnsafePathError(input, 'contains parent segment');

  const normalized = path.posix.normalize(input);
  if (normalized === '.' || normalized.startsWith('../')) {
    throw new UnsafePathError(input, 'escapes repository');
  }

  if (normalized.split('/').some((segment) => segment.toLowerCase() === '.git')) {
    throw new UnsafePathError(input, 'targets .git');
  }

  return normalized;
}

export function normalizeBranchName(input: string): string {
  const hasForbiddenCharacter = [...input].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 || /\s/u.test(character) || '~^:?*[\\'.includes(character);
  });
  if (
    input.length === 0 ||
    input.startsWith('/') ||
    input.endsWith('/') ||
    input.startsWith('.') ||
    input.endsWith('.') ||
    input.startsWith('refs/') ||
    input.includes('..') ||
    input.includes('//') ||
    input.includes('@{') ||
    input.endsWith('.lock') ||
    hasForbiddenCharacter
  ) {
    throw new Error('invalid branch name');
  }

  return input;
}

export function repositoryName(gameId: string): string {
  if (!/^[A-Za-z0-9._-]+$/u.test(gameId) || gameId === '.' || gameId === '..') {
    throw new Error('invalid game id');
  }

  return `gm-${gameId}`;
}
