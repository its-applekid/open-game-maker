import { migrate, openDb } from '@ogm/db';
import { afterEach, describe, expect, it } from 'vitest';

import { createDbDaemonStore } from '../../src/fleet/store.js';
import { buildFleet, cleanupHomes, liveRow, tempHome } from './helpers.js';

afterEach(cleanupHomes);

function migratedStore() {
  const { sqlite, db } = openDb(':memory:');
  migrate({ sqlite });
  return { sqlite, store: createDbDaemonStore(db) };
}

describe('createDbDaemonStore', () => {
  it('persists the record through the game_daemons migration', async () => {
    const { sqlite, store } = migratedStore();
    await store.insert(liveRow(2, 'stopped'));
    await store.insert(liveRow(1, 'running', { maxConcurrentAgents: 2 }));

    expect(await store.update('owner-game2', { status: 'starting', lastError: 'x' })).toMatchObject({
      status: 'starting',
      lastError: 'x',
    });
    expect((await store.list()).map((row) => row.slug)).toEqual(['owner-game1', 'owner-game2']);
    expect(await store.bySlug('owner-game1')).toEqual(liveRow(1, 'running', { maxConcurrentAgents: 2 }));
    await expect(store.bySlug('no-such-game')).resolves.toBeUndefined();
    expect(sqlite.prepare('SELECT name FROM pragma_table_info(?)').all('game_daemons')).not.toContainEqual({
      name: 'client_token',
    });
    sqlite.close();
  });

  it('rejects a second daemon on the same port or slug, and an unknown status', async () => {
    const { sqlite, store } = migratedStore();
    await store.insert(liveRow(1));

    await expect(store.insert({ ...liveRow(2), port: 4101 })).rejects.toThrow(/UNIQUE/);
    await expect(store.insert({ ...liveRow(3), slug: 'owner-game1' })).rejects.toThrow(/UNIQUE/);
    await expect(store.insert({ ...liveRow(4), status: 'crashed' as never })).rejects.toThrow(/CHECK/);
    sqlite.close();
  });

  it('keeps two games on one instance repository as separate daemons', async () => {
    const { sqlite, store } = migratedStore();
    await store.insert(liveRow(1, 'stopped', { repo: 'owner/instance' }));
    await store.insert(liveRow(2, 'stopped', { repo: 'owner/instance' }));

    expect((await store.list()).map((row) => [row.slug, row.repo])).toEqual([
      ['owner-game1', 'owner/instance'],
      ['owner-game2', 'owner/instance'],
    ]);
    expect((await store.bySlug('owner-game2'))?.port).toBe(4102);
    sqlite.close();
  });

  it('backs a fleet start end to end', async () => {
    const home = await tempHome();
    const { sqlite, store } = migratedStore();
    const { fleet } = buildFleet(home, { store });

    await expect(fleet.ensureDaemon({ slug: 'castle-run', repo: 'owner/instance' }, 'feature')).resolves.toMatchObject({
      status: 'running',
    });
    expect(await store.bySlug('castle-run')).toMatchObject({ repo: 'owner/instance', port: 4101, status: 'running' });
    sqlite.close();
  });
});
