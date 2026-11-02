import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import { Outbox } from './outbox.js';

const databases: string[] = [];
const databaseName = () => {
  const name = `ogm-saves-test-${crypto.randomUUID()}`;
  databases.push(name);
  return name;
};

afterEach(async () => {
  await Promise.all(databases.splice(0).map((name) => Outbox.deleteDatabase(name)));
});

describe('save outbox', () => {
  it('persists pending uploads across a simulated reload', async () => {
    const name = databaseName();
    const first = await Outbox.open(name);
    await first.enqueue({
      key: 'device:1',
      gameId: 'game',
      slotId: 'auto',
      headers: { test: 'header' },
      body: new Uint8Array([1, 2, 3]),
      attempts: 0,
      nextAttemptAt: 0,
      createdAt: 1,
    });
    first.close();

    const reloaded = await Outbox.open(name);
    const pending = await reloaded.pending();
    reloaded.close();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ key: 'device:1' });
    expect(Array.from(pending[0]?.body ?? [])).toEqual([1, 2, 3]);
  });
});
