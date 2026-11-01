import { describe, expect, it } from 'vitest';

import { normalizeBranchName, normalizeCommitPath } from '../src/paths.js';

describe('normalizeCommitPath', () => {
  it('normalizes a safe relative path', () => {
    expect(normalizeCommitPath('design//entities.json')).toBe('design/entities.json');
  });

  it.each(['../secret', '/etc/passwd', '.git/config', 'design/../secret', 'a\\b', 'a\0b'])(
    'refuses unsafe path %s',
    (path) => {
      expect(() => normalizeCommitPath(path)).toThrow();
    },
  );
});

describe('normalizeBranchName', () => {
  it('accepts a namespaced branch', () => {
    expect(normalizeBranchName('branch/game-1')).toBe('branch/game-1');
  });

  it.each(['refs/heads/main', '../main', 'main..next', 'main.lock', 'main~1', '/main'])(
    'refuses invalid branch %s',
    (branch) => {
      expect(() => normalizeBranchName(branch)).toThrow();
    },
  );
});
