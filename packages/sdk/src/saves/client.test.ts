import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SaveClient } from './client.js';
import { Outbox } from './outbox.js';

const ids = {
  game: 'g_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  device: 'device_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  tab: 'tab_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  branch: 'b_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  build: 'build_01ARZ3NDEKTSV4RRFFQ69G5FAV',
} as const;

const databases: string[] = [];
const clients: SaveClient<unknown>[] = [];

async function setup(
  fetch: typeof globalThis.fetch,
  encode?: (value: unknown) => Promise<Uint8Array>,
  name = `ogm-client-test-${crypto.randomUUID()}`,
) {
  databases.push(name);
  const outbox = await Outbox.open(name);
  const onlineTarget = new EventTarget();
  const client = new SaveClient({
    baseUrl: 'https://app.test/api/v1',
    gameId: ids.game,
    deviceId: ids.device,
    tabId: ids.tab,
    branchId: ids.branch,
    buildId: ids.build,
    outbox,
    fetch,
    onlineTarget,
    encode: encode ?? (async (value) => new TextEncoder().encode(JSON.stringify(value))),
  });
  clients.push(client as SaveClient<unknown>);
  return { client, outbox, onlineTarget };
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.dispose();
  await Promise.all(databases.splice(0).map((name) => Outbox.deleteDatabase(name)));
  localStorage.clear();
});

describe('save client', () => {
  it('uploads from the outbox and reaches saved_cloud', async () => {
    const fetch = vi.fn(async () => Response.json({ revision: 1 }));
    const { client, outbox } = await setup(fetch as typeof globalThis.fetch);

    expect(await client.put('auto', { saveSchemaVersion: 1, data: { hp: 3 }, reason: 'interval' })).toEqual({
      state: 'saved_cloud',
      revision: 1,
    });
    expect(await outbox.pending()).toEqual([]);
    expect(fetch).toHaveBeenCalledWith(
      `https://app.test/api/v1/saves/${ids.game}/auto`,
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ 'idempotency-key': `${ids.device}:1` }),
      }),
    );
  });

  it('keeps a local copy on 409 and leaves the cloud head untouched', async () => {
    const fetch = vi.fn(async () => Response.json({ headRevision: 7 }, { status: 409 }));
    const { client, outbox } = await setup(fetch as typeof globalThis.fetch);

    expect(await client.put('auto', { saveSchemaVersion: 1, data: { hp: 3 }, reason: 'interval' })).toEqual({
      state: 'conflict',
      headRevision: 7,
    });
    expect(await outbox.localCopies()).toEqual([
      expect.objectContaining({ slotId: 'auto', label: expect.stringContaining(`Copy from ${ids.device}`) }),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('becomes read-only on 423 and keeps the pending local save', async () => {
    const fetch = vi.fn(async () => Response.json({ heldBy: 'device_other' }, { status: 423 }));
    const { client, outbox } = await setup(fetch as typeof globalThis.fetch);

    expect(await client.put('auto', { saveSchemaVersion: 1, data: { hp: 3 }, reason: 'interval' })).toEqual({
      state: 'read_only',
      heldBy: 'device_other',
    });
    expect(await outbox.pending()).toHaveLength(1);
  });

  it('retries a queued upload when the browser comes online', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(Response.json({ revision: 1 }));
    const { client, onlineTarget } = await setup(fetch as typeof globalThis.fetch);

    expect(await client.put('auto', { saveSchemaVersion: 1, data: { hp: 3 }, reason: 'interval' })).toEqual({
      state: 'queued',
    });
    onlineTarget.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(client.state('auto')).toBe('saved_cloud'));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps queued saves for different games distinct', async () => {
    const name = `ogm-client-test-${crypto.randomUUID()}`;
    databases.push(name);
    const outbox = await Outbox.open(name);
    const fetch = vi.fn(async () => {
      throw new TypeError('offline');
    });
    const makeClient = (gameId: string) => {
      const client = new SaveClient({
        baseUrl: 'https://app.test/api/v1',
        gameId,
        deviceId: ids.device,
        tabId: ids.tab,
        branchId: ids.branch,
        buildId: ids.build,
        outbox,
        fetch: fetch as typeof globalThis.fetch,
        onlineTarget: new EventTarget(),
        encode: async (value) => new TextEncoder().encode(JSON.stringify(value)),
      });
      clients.push(client);
      return client;
    };
    const otherGame = 'g_01BX5ZZKBKACTAV9WEVGEMMVRZ';

    await makeClient(ids.game).put('auto', { saveSchemaVersion: 1, data: { hp: 3 }, reason: 'interval' });
    await makeClient(otherGame).put('auto', { saveSchemaVersion: 1, data: { hp: 4 }, reason: 'interval' });

    expect(await outbox.pending()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: `${ids.game}:${ids.device}:1`, gameId: ids.game }),
        expect.objectContaining({ key: `${otherGame}:${ids.device}:1`, gameId: otherGame }),
      ]),
    );
    expect(await outbox.pending()).toHaveLength(2);
  });

  it('drains an outbox restored on launch', async () => {
    const name = `ogm-client-test-${crypto.randomUUID()}`;
    const first = await Outbox.open(name);
    await first.enqueue({
      key: `${ids.device}:9`,
      gameId: ids.game,
      slotId: 'auto',
      headers: { 'idempotency-key': `${ids.device}:9` },
      body: new Uint8Array([1, 2, 3]),
      attempts: 1,
      nextAttemptAt: Date.now() + 60_000,
      createdAt: 1,
    });
    first.close();
    const fetch = vi.fn(async () => Response.json({ revision: 1 }));
    const { client, outbox } = await setup(fetch as typeof globalThis.fetch, undefined, name);

    await client.start();
    expect(client.state('auto')).toBe('saved_cloud');
    expect(await outbox.pending()).toEqual([]);
  });

  it('migrates one predecessor schema once and uploads a migration revision', async () => {
    const oldSave = { saveSchemaVersion: 2, data: { hp: 3 } };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          slots: [
            {
              slotId: 'auto',
              headRevision: 7,
              status: 'needs_migration',
              olderCompatible: [7],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(oldSave), { headers: { 'x-save-revision': '7', 'x-save-schema': '2' } }),
      )
      .mockResolvedValueOnce(Response.json({ revision: 8 }));
    const { client } = await setup(fetch as typeof globalThis.fetch);
    const migrate = vi.fn(() => ({ saveSchemaVersion: 3, data: { hp: 4 } }));

    const result = await client.load('auto', { schema: 3, migratesFrom: 2, migrate });
    expect(migrate).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ status: 'needs_migration', revision: 8, save: { saveSchemaVersion: 3 } });
    expect(fetch.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          'if-match': '7',
          'x-save-reason': 'migration',
          'x-save-migrated-from': '7',
        }),
      }),
    );
  });

  it('does not migrate unsupported old saves', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        slots: [{ slotId: 'auto', headRevision: 4, status: 'unsupported_old', olderCompatible: [] }],
      }),
    );
    const { client } = await setup(fetch as typeof globalThis.fetch);
    const migrate = vi.fn();

    expect(await client.load('auto', { schema: 3, migratesFrom: 2, migrate })).toEqual({
      status: 'unsupported_old',
      olderCompatible: [],
    });
    expect(migrate).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('queues hidden bodies above 60 KB without a keepalive attempt', async () => {
    const fetch = vi.fn();
    const { client } = await setup(fetch as typeof globalThis.fetch, async () => new Uint8Array(60 * 1024 + 1));

    expect(
      await client.put('auto', { saveSchemaVersion: 1, data: { hp: 3 }, reason: 'hidden' }, { hidden: true }),
    ).toEqual({ state: 'queued' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
