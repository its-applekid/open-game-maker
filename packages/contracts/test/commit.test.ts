import { describe, expect, it } from 'vitest';

import { BoundaryVerdict, CommitOp, CommitResult, GAMES_ROOT, gameFolder } from '../src/commit.js';

const operations = [
  {
    kind: 'create_game',
    gameId: 'game-1',
    slug: 'castle-game',
    templateRef: 'default',
    visibility: 'private',
  },
  {
    kind: 'create_game',
    gameId: 'game-2',
    slug: 'castle-game',
    templateRef: 'default',
    visibility: 'public',
    from: { gameId: 'game-1', sha: 'abc' },
  },
  {
    kind: 'fold_design',
    gameId: 'game-1',
    base: 'abc',
    files: [{ path: 'design/entities.json', content: '{}' }],
  },
  {
    kind: 'fold_design',
    gameId: 'game-1',
    base: 'abc',
    files: [{ path: 'packages/ui/button.ts', content: '' }],
    promotion: true,
  },
  { kind: 'release', gameId: 'game-1', sha: 'abc', semver: '1.2.3', changelog: 'New level' },
  { kind: 'restore_game', gameId: 'game-1', sha: 'abc' },
  { kind: 'merge', gameId: 'game-1', prNumber: 7 },
  { kind: 'set_visibility', gameId: 'game-1', visibility: 'public' },
  { kind: 'file_issue', title: 'Builder crashed', body: 'Safe diagnostic', labels: ['bug', 'source:report'] },
  {
    kind: 'file_issue',
    gameId: 'game-1',
    title: 'The door will not open',
    body: 'Reported from the game',
    labels: ['bug'],
  },
  { kind: 'create_branch', gameId: 'game-1', branch: 'feature/level-2', sha: 'abc' },
] as const;

describe('CommitOp', () => {
  it.each(operations)('parses $kind', (operation) => {
    expect(CommitOp.parse(operation)).toEqual(operation);
  });

  it.each([
    { kind: 'create_repo', gameId: 'game-1', owner: 'alice', visibility: 'private', templateRef: 'default' },
    { kind: 'fork', sourceGameId: 'game-1', sourceSha: 'abc', newGameId: 'game-2', owner: 'alice' },
    { kind: 'create_game', gameId: 'game-1', slug: 'Castle Game', templateRef: 'default', visibility: 'private' },
    {
      kind: 'create_game',
      gameId: 'game-1',
      slug: 'castle-game',
      owner: 'alice',
      templateRef: 'd',
      visibility: 'private',
    },
    { kind: 'push', gameId: 'game-1' },
    { kind: 'set_visibility', gameId: 'game-1', visibility: 'internal' },
  ])('refuses an invalid operation %#', (operation) => {
    expect(CommitOp.safeParse(operation).success).toBe(false);
  });
});

describe('game folder convention', () => {
  it('puts each game in its own folder of the instance repository', () => {
    expect(GAMES_ROOT).toBe('games');
    expect(gameFolder('castle-game')).toBe('games/castle-game');
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
