import { describe, expect, it } from 'vitest';

import { BoundaryVerdict, CommitOp, CommitResult } from '../src/commit.js';

const operations = [
  { kind: 'create_repo', gameId: 'game-1', owner: 'alice', visibility: 'private', templateRef: 'default' },
  {
    kind: 'fold_design',
    gameId: 'game-1',
    base: 'abc',
    files: [{ path: 'design/entities.json', content: '{}' }],
  },
  {
    kind: 'fork',
    sourceGameId: 'game-1',
    sourceSha: 'abc',
    newGameId: 'game-2',
    owner: 'alice',
    visibility: 'public',
  },
  { kind: 'release', gameId: 'game-1', sha: 'abc', semver: '1.2.3', changelog: 'New level' },
  { kind: 'merge', gameId: 'game-1', prNumber: 7 },
  { kind: 'set_visibility', gameId: 'game-1', visibility: 'public' },
  { kind: 'file_issue', title: 'Builder crashed', body: 'Safe diagnostic', labels: ['bug', 'source:report'] },
  { kind: 'create_branch', gameId: 'game-1', branch: 'feature/level-2', sha: 'abc' },
] as const;

describe('CommitOp', () => {
  it.each(operations)('parses $kind', (operation) => {
    expect(CommitOp.parse(operation)).toEqual(operation);
  });

  it.each([
    { kind: 'push', gameId: 'game-1' },
    { kind: 'set_visibility', gameId: 'game-1', visibility: 'internal' },
    { kind: 'fork', sourceGameId: 'game-1', sourceSha: 'abc', newGameId: 'game-2', owner: 'alice' },
  ])('refuses an invalid operation %#', (operation) => {
    expect(CommitOp.safeParse(operation).success).toBe(false);
  });
});

describe('commit results', () => {
  it('parses success and refusal results', () => {
    expect(CommitResult.parse({ ok: true, sha: 'abc' })).toEqual({ ok: true, sha: 'abc' });
    const verdict = {
      allowed: false,
      reasons: [{ code: 'path', path: '../x', detail: 'unsafe repository path' }],
    };
    expect(BoundaryVerdict.parse(verdict)).toEqual(verdict);
    expect(CommitResult.parse({ ok: false, verdict })).toEqual({ ok: false, verdict });
  });
});
