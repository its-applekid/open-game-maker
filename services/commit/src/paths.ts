import path from 'node:path';

import { GAMES_ROOT, PACKAGES_ROOT, gameFolder as folderFor } from '@ogm/contracts';

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

// Every game in an instance lives in one folder of the instance repository: `games/<slug>/`; components the instance's
// games share live under `packages/`. The convention itself lives in the contract so the API and the commit service
// cannot drift apart.
export { GAMES_ROOT, PACKAGES_ROOT };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function normalizeGameSlug(input: string): string {
  if (input.length === 0 || input.length > 48 || !SLUG_PATTERN.test(input)) throw new Error('invalid game slug');
  return input;
}

export function gameFolder(slug: string): string {
  return folderFor(normalizeGameSlug(slug));
}

// A game's registry path without its trailing slash, so folder comparisons are one shape everywhere.
export function normalizeGamePath(input: string): string {
  const normalized = normalizeCommitPath(input).replace(/\/+$/u, '');
  const segments = normalized.split('/');
  if (segments.length !== 2 || segments[0] !== GAMES_ROOT) {
    throw new UnsafePathError(input, 'not a game folder');
  }
  normalizeGameSlug(segments[1] ?? '');
  return normalized;
}
