import { schema } from '@ogm/db';
import { describe, expect, it } from 'vitest';

import { copyCatalog, registerCatalog } from '../src/achievements/catalog.js';
import { CatalogLintError, lintCatalog } from '../src/achievements/lint.js';
import { award, progress } from '../src/achievements/store.js';
import { makeDeps } from './helpers.js';

const now = '2026-11-01T00:00:00.000Z';
const familyId = 'f-achievements';

function seedGames(deps: ReturnType<typeof makeDeps>) {
  deps.db
    .insert(schema.families)
    .values({ id: familyId, name: 'Family', ownerUserId: 'u-owner', createdAt: now })
    .run();
  deps.db
    .insert(schema.games)
    .values([
      {
        id: 'g-source',
        familyId,
        ownerId: 'u-owner',
        title: 'Source',
        visibility: 'listed',
        repoVisibility: 'private',
        createdAt: now,
      },
      {
        id: 'g-fork',
        familyId,
        ownerId: 'u-owner',
        title: 'Fork',
        visibility: 'private',
        repoVisibility: 'private',
        createdAt: now,
      },
    ])
    .run();
}

const defs = [
  {
    key: 'first-dungeon',
    title: 'Into the Dark',
    description: 'Finish the first dungeon',
    icon: 'assets/dungeon.png',
    hidden: false,
  },
  {
    key: 'shrines',
    title: 'Pilgrim',
    description: 'Visit five shrines',
    icon: 'assets/shrine.png',
    hidden: false,
    progress: { target: 5 },
  },
];

describe('achievement catalog and store', () => {
  it('awards 1,000 concurrent calls exactly once', async () => {
    const deps = makeDeps();
    seedGames(deps);
    registerCatalog(deps.db, 'g-source', 'rel-1', defs, now);

    const results = await Promise.all(
      Array.from({ length: 1_000 }, async () =>
        award(deps.db, {
          userId: 'u-player',
          gameId: 'g-source',
          key: 'first-dungeon',
          releaseId: 'rel-1',
          source: 'client',
          now,
        }),
      ),
    );

    expect(results.filter(({ newlyAwarded }) => newlyAwarded)).toHaveLength(1);
    expect(deps.db.select().from(schema.achievementAwards).all()).toHaveLength(1);
  });

  it('rejects unpublished, unknown, and retired keys before writing', () => {
    const deps = makeDeps();
    seedGames(deps);
    registerCatalog(deps.db, 'g-source', 'rel-1', defs, now);
    registerCatalog(
      deps.db,
      'g-source',
      'rel-2',
      [{ ...defs[0]!, retired: true }, defs[1]!],
      '2026-11-02T00:00:00.000Z',
    );

    const call = (releaseId: string, key: string) =>
      award(deps.db, { userId: 'u-player', gameId: 'g-source', key, releaseId, source: 'client', now });
    expect(() => call('missing', 'first-dungeon')).toThrowError(expect.objectContaining({ code: 'not_published' }));
    expect(() => call('rel-1', 'not-real')).toThrowError(expect.objectContaining({ code: 'unknown_key' }));
    expect(() => call('rel-2', 'first-dungeon')).toThrowError(expect.objectContaining({ code: 'retired' }));
    expect(deps.db.select().from(schema.achievementAwards).all()).toEqual([]);
  });

  it('keeps progress monotonic and auto-awards at the target', () => {
    const deps = makeDeps();
    seedGames(deps);
    registerCatalog(deps.db, 'g-source', 'rel-1', defs, now);

    expect(
      progress(deps.db, { userId: 'u-player', gameId: 'g-source', key: 'shrines', value: 3, releaseId: 'rel-1', now }),
    ).toEqual({ value: 3, newlyAwarded: false });
    expect(
      progress(deps.db, { userId: 'u-player', gameId: 'g-source', key: 'shrines', value: 5, releaseId: 'rel-1', now }),
    ).toEqual({ value: 5, newlyAwarded: true });
    expect(
      progress(deps.db, { userId: 'u-player', gameId: 'g-source', key: 'shrines', value: 4, releaseId: 'rel-1', now }),
    ).toEqual({ value: 5, newlyAwarded: false });
  });

  it('lints vanished and reused retired keys while accepting metadata edits', () => {
    expect(lintCatalog(defs, [{ ...defs[0]!, title: 'A better title' }, defs[1]!])).toEqual([]);
    expect(lintCatalog(defs, [defs[0]!])).toEqual([
      expect.objectContaining({ code: 'missing_retirement', key: 'shrines' }),
    ]);

    const retired = [{ ...defs[0]!, retired: true }, defs[1]!];
    expect(() => {
      const deps = makeDeps();
      seedGames(deps);
      registerCatalog(deps.db, 'g-source', 'rel-1', defs, now);
      registerCatalog(deps.db, 'g-source', 'rel-2', retired, '2026-11-02T00:00:00.000Z');
      registerCatalog(deps.db, 'g-source', 'rel-3', defs, '2026-11-03T00:00:00.000Z');
    }).toThrow(CatalogLintError);
  });

  it('keeps release catalogs immutable and makes exact publish retries idempotent', () => {
    const deps = makeDeps();
    seedGames(deps);
    registerCatalog(deps.db, 'g-source', 'rel-1', defs, now);
    registerCatalog(
      deps.db,
      'g-source',
      'rel-2',
      [{ ...defs[0]!, retired: true }, defs[1]!],
      '2026-11-02T00:00:00.000Z',
    );

    registerCatalog(deps.db, 'g-source', 'rel-1', defs, '2026-11-03T00:00:00.000Z');
    expect(() =>
      registerCatalog(deps.db, 'g-source', 'rel-1', [{ ...defs[0]!, title: 'Changed' }, defs[1]!]),
    ).toThrowError(expect.objectContaining({ issues: [{ code: 'release_conflict', key: 'rel-1' }] }));
    expect(deps.db.select().from(schema.achievementCatalogs).all()).toHaveLength(2);
  });

  it('copies definitions without awards or progress', () => {
    const deps = makeDeps();
    seedGames(deps);
    registerCatalog(deps.db, 'g-source', 'rel-1', defs, now);
    award(deps.db, {
      userId: 'u-player',
      gameId: 'g-source',
      key: 'first-dungeon',
      releaseId: 'rel-1',
      source: 'client',
      now,
    });

    expect(copyCatalog(deps.db, 'g-source', 'g-fork', 'fork-rel-1', now)).toBe(2);
    expect(
      deps.db
        .select()
        .from(schema.achievementDefs)
        .all()
        .filter(({ gameId }) => gameId === 'g-fork'),
    ).toHaveLength(2);
    expect(
      deps.db
        .select()
        .from(schema.achievementAwards)
        .all()
        .filter(({ gameId }) => gameId === 'g-fork'),
    ).toEqual([]);
    expect(
      deps.db
        .select()
        .from(schema.achievementProgress)
        .all()
        .filter(({ gameId }) => gameId === 'g-fork'),
    ).toEqual([]);
  });
});
