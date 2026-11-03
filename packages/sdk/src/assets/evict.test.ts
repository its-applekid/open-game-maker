import { describe, expect, it } from 'vitest';

import {
  CACHE_EVICTION_POLICY,
  evictAssetCaches,
  type CacheEvictionDependencies,
  type CacheEvictionLedger,
  type EvictionLedgerBuild,
} from './evict.js';

const DAY_MS = 24 * 60 * 60 * 1_000;
const NOW = Date.UTC(2026, 10, 2);

function build(overrides: Partial<EvictionLedgerBuild> & Pick<EvictionLedgerBuild, 'gameId' | 'buildId'>): EvictionLedgerBuild {
  const { gameId, buildId, ...rest } = overrides;
  const lastPlayedAt = overrides.lastPlayedAt ?? NOW;
  return {
    key: `${gameId}/${buildId}`,
    gameId,
    buildId,
    channel: 'published',
    tier: 'desktop',
    hashes: [`hash-${buildId}`],
    bytes: 10,
    firstPlayedAt: lastPlayedAt,
    lastPlayedAt,
    plays: 1,
    ...rest,
  };
}

class FakeCache {
  readonly urls: Set<string>;

  constructor(urls: string[]) {
    this.urls = new Set(urls);
  }

  async keys(): Promise<Request[]> {
    return [...this.urls].map((url) => new Request(url));
  }

  async delete(request: RequestInfo | URL): Promise<boolean> {
    const url = request instanceof Request ? request.url : new URL(request.toString(), 'https://games.test').toString();
    return this.urls.delete(url);
  }
}

class FakeLedger implements CacheEvictionLedger {
  readonly builds: Map<string, EvictionLedgerBuild>;

  constructor(builds: EvictionLedgerBuild[]) {
    this.builds = new Map(builds.map((entry) => [entry.key, entry]));
  }

  async list(): Promise<EvictionLedgerBuild[]> {
    return [...this.builds.values()];
  }

  async delete(keys: string[]): Promise<void> {
    for (const key of keys) this.builds.delete(key);
  }
}

function setup(
  builds: EvictionLedgerBuild[],
  options: {
    blobHashes?: string[];
    buildUrls?: string[];
    quota?: number;
    lockAvailable?: boolean;
  } = {},
): {
  dependencies: CacheEvictionDependencies;
  ledger: FakeLedger;
  blobs: FakeCache;
  buildCache: FakeCache;
} {
  const ledger = new FakeLedger(builds);
  const blobs = new FakeCache(
    (options.blobHashes ?? builds.flatMap((entry) => entry.hashes)).map(
      (hash) => `https://games.test/a/${hash}.webp`,
    ),
  );
  const buildCache = new FakeCache(
    options.buildUrls ?? builds.map((entry) => `https://games.test/g/${entry.gameId}/${entry.buildId}/main.js`),
  );
  const caches = new Map([
    ['gm-blobs-v1', blobs],
    ['gm-builds-v1', buildCache],
  ]);

  return {
    ledger,
    blobs,
    buildCache,
    dependencies: {
      now: () => NOW,
      ledger,
      caches: {
        async open(name) {
          const cache = caches.get(name);
          if (!cache) throw new Error(`Unexpected cache: ${name}`);
          return cache;
        },
      },
      locks: {
        async request(_name, _options, callback) {
          return callback(options.lockAvailable === false ? null : ({} as Lock));
        },
      },
      storage: {
        async estimate() {
          return { quota: options.quota ?? 10_000 };
        },
      },
    },
  };
}

describe('evictAssetCaches', () => {
  it('keeps a shared hash while any retained build references it', async () => {
    const stale = build({
      gameId: 'game',
      buildId: 'old',
      hashes: ['shared', 'stale-only'],
      lastPlayedAt: NOW - 31 * DAY_MS,
    });
    const current = build({ gameId: 'game', buildId: 'new', hashes: ['shared', 'current-only'] });
    const { dependencies, ledger, blobs, buildCache } = setup([stale, current]);

    await evictAssetCaches(dependencies);

    expect(blobs.urls).toEqual(
      new Set(['https://games.test/a/shared.webp', 'https://games.test/a/current-only.webp']),
    );
    expect(buildCache.urls).toEqual(new Set(['https://games.test/g/game/new/main.js']));
    expect([...ledger.builds]).toHaveLength(1);
    expect(ledger.builds.has(current.key)).toBe(true);
  });

  it('keeps an old build only when it is the newest played build for its game', async () => {
    const newestOld = build({ gameId: 'quiet', buildId: 'only', lastPlayedAt: NOW - 31 * DAY_MS });
    const supersededOld = build({ gameId: 'active', buildId: 'old', lastPlayedAt: NOW - 31 * DAY_MS });
    const current = build({ gameId: 'active', buildId: 'new', lastPlayedAt: NOW - DAY_MS });
    const { dependencies, ledger } = setup([newestOld, supersededOld, current]);

    await evictAssetCaches(dependencies);

    expect([...ledger.builds.keys()].sort()).toEqual([current.key, newestOld.key].sort());
  });

  it('drops the third-newest draft even when it was played recently', async () => {
    const drafts = [
      build({ gameId: 'game', buildId: 'draft-1', channel: 'draft', lastPlayedAt: NOW - 3_000 }),
      build({ gameId: 'game', buildId: 'draft-2', channel: 'draft', lastPlayedAt: NOW - 2_000 }),
      build({ gameId: 'game', buildId: 'draft-3', channel: 'draft', lastPlayedAt: NOW - 1_000 }),
    ];
    const { dependencies, ledger } = setup(drafts);

    await evictAssetCaches(dependencies);

    expect([...ledger.builds.keys()].sort()).toEqual(['game/draft-2', 'game/draft-3']);
  });

  it('drops the least recently played game first when retained builds exceed the budget', async () => {
    const leastRecent = build({ gameId: 'old-game', buildId: 'only', bytes: 60, lastPlayedAt: NOW - 2_000 });
    const mostRecent = build({ gameId: 'new-game', buildId: 'only', bytes: 60, lastPlayedAt: NOW - 1_000 });
    const { dependencies, ledger } = setup([leastRecent, mostRecent], { quota: 400 });

    await evictAssetCaches(dependencies);

    expect(CACHE_EVICTION_POLICY.quotaRatio).toBe(0.25);
    expect([...ledger.builds.keys()]).toEqual([mostRecent.key]);
  });

  it('deletes orphan blob entries without ledger rows', async () => {
    const current = build({ gameId: 'game', buildId: 'current', hashes: ['live'] });
    const { dependencies, blobs } = setup([current], { blobHashes: ['live', 'orphan'] });

    await evictAssetCaches(dependencies);

    expect(blobs.urls).toEqual(new Set(['https://games.test/a/live.webp']));
  });

  it('does nothing while a shared cache lock is held', async () => {
    const stale = build({ gameId: 'game', buildId: 'stale', lastPlayedAt: NOW - 31 * DAY_MS });
    const current = build({ gameId: 'game', buildId: 'current' });
    const { dependencies, ledger, blobs, buildCache } = setup([stale, current], { lockAvailable: false });
    const beforeBlobs = new Set(blobs.urls);
    const beforeBuilds = new Set(buildCache.urls);

    await evictAssetCaches(dependencies);

    expect(blobs.urls).toEqual(beforeBlobs);
    expect(buildCache.urls).toEqual(beforeBuilds);
    expect([...ledger.builds.keys()].sort()).toEqual([current.key, stale.key].sort());
  });
});
