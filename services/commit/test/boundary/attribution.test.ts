import { describe, expect, it } from 'vitest';

import type { ActiveRepository } from '../../src/boundary/api-client.js';
import { gameForChangedFiles } from '../../src/boundary/checker.js';
import { groupActiveRepositories } from '../../src/boundary/poller.js';

const CASTLE = { gameId: 'g-castle', path: 'games/castle' };
const DUNGEON = { gameId: 'g-dungeon', path: 'games/dungeon' };

const files = (...paths: string[]): { filename: string }[] => paths.map((filename) => ({ filename }));

function active(overrides: Partial<ActiveRepository> & Pick<ActiveRepository, 'gameId' | 'path'>): ActiveRepository {
  return {
    owner: 'alice',
    name: 'instance',
    visibility: 'private',
    slug: 'castle',
    ...overrides,
  };
}

describe('gameForChangedFiles', () => {
  it('attributes a pull request to the single game whose folder it touches', () => {
    expect(
      gameForChangedFiles(files('games/castle/index.html', 'games/castle/assets/a.png'), [CASTLE, DUNGEON]),
    ).toEqual(CASTLE);
  });

  it('attributes nested and deeply nested files to their game', () => {
    expect(gameForChangedFiles(files('games/dungeon/src/scenes/title.ts'), [CASTLE, DUNGEON])).toEqual(DUNGEON);
  });

  it('refuses a pull request spanning two game folders', () => {
    expect(gameForChangedFiles(files('games/castle/a.png', 'games/dungeon/b.png'), [CASTLE, DUNGEON])).toBeNull();
  });

  it('refuses a pull request touching a game folder and the shared packages', () => {
    expect(gameForChangedFiles(files('games/castle/a.png', 'packages/ui/button.ts'), [CASTLE, DUNGEON])).toBeNull();
  });

  it('refuses a pull request touching only shared packages', () => {
    expect(gameForChangedFiles(files('packages/ui/button.ts'), [CASTLE, DUNGEON])).toBeNull();
  });

  it('does not confuse a game folder with a longer sibling that shares its prefix', () => {
    const longer = { gameId: 'g-castle-two', path: 'games/castle-two' };
    expect(gameForChangedFiles(files('games/castle-two/a.png'), [CASTLE, longer])).toEqual(longer);
    expect(gameForChangedFiles(files('games/castle/a.png'), [CASTLE, longer])).toEqual(CASTLE);
  });

  it('refuses when the repository has no games to attribute the change to', () => {
    expect(gameForChangedFiles(files('games/castle/a.png'), [])).toBeNull();
  });

  it('refuses an empty change set rather than attributing it to an arbitrary game', () => {
    expect(gameForChangedFiles([], [CASTLE, DUNGEON])).toBeNull();
  });
});

describe('groupActiveRepositories', () => {
  it('groups every game sharing an instance repository into one check', () => {
    expect(
      groupActiveRepositories([
        active({ gameId: 'g-castle', path: 'games/castle' }),
        active({ gameId: 'g-dungeon', path: 'games/dungeon' }),
      ]),
    ).toEqual([
      {
        repository: { owner: 'alice', name: 'instance', visibility: 'private' },
        games: [CASTLE, DUNGEON],
      },
    ]);
  });

  it('keeps separate repositories in separate groups', () => {
    const groups = groupActiveRepositories([
      active({ gameId: 'g-castle', path: 'games/castle' }),
      active({ gameId: 'g-other', path: 'games/other', name: 'other-instance' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.repository.name)).toEqual(['instance', 'other-instance']);
  });

  it('folds owner and name case when grouping, matching how installations resolve', () => {
    expect(
      groupActiveRepositories([
        active({ gameId: 'g-castle', path: 'games/castle' }),
        active({ gameId: 'g-dungeon', path: 'games/dungeon', owner: 'ALICE', name: 'INSTANCE' }),
      ]),
    ).toHaveLength(1);
  });

  it('carries the repository visibility from the first game in the group', () => {
    const [group] = groupActiveRepositories([
      active({ gameId: 'g-castle', path: 'games/castle', visibility: 'public' }),
    ]);
    expect(group?.repository.visibility).toBe('public');
  });
});
