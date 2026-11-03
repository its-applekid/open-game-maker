import type { Tier } from '@ogm/contracts/assets';

export const CACHE_EVICTION_POLICY = {
  retentionMs: 30 * 24 * 60 * 60 * 1_000,
  draftsPerGame: 2,
  maxBytes: 1024 ** 3,
  quotaRatio: 0.25,
  idleTimeoutMs: 5_000,
} as const;

const BLOB_CACHE = 'gm-blobs-v1';
const BUILD_CACHE = 'gm-builds-v1';

export interface EvictionLedgerBuild {
  key: string;
  gameId: string;
  buildId: string;
  channel: 'published' | 'draft' | 'test';
  tier: Tier;
  hashes: string[];
  bytes: number;
  firstPlayedAt: number;
  lastPlayedAt: number;
  plays: number;
}

export interface CacheEvictionLedger {
  list(): Promise<EvictionLedgerBuild[]>;
  delete(keys: string[]): Promise<void>;
}

interface CacheForEviction {
  keys(): Promise<readonly Request[]>;
  delete(request: RequestInfo | URL): Promise<boolean>;
}

interface CacheStorageForEviction {
  open(name: string): Promise<CacheForEviction>;
}

interface LockManagerForEviction {
  request<T>(
    name: string,
    options: LockOptions,
    callback: (lock: Lock | null) => Promise<T> | T,
  ): Promise<T>;
}

interface StorageManagerForEviction {
  estimate(): Promise<Pick<StorageEstimate, 'quota'>>;
}

export interface CacheEvictionDependencies {
  ledger: CacheEvictionLedger;
  caches: CacheStorageForEviction;
  locks: LockManagerForEviction;
  storage: StorageManagerForEviction;
  now?: () => number;
}

interface IdleScheduler {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  setTimeout(callback: () => void, timeout: number): ReturnType<typeof setTimeout>;
}

function compareNewest(left: EvictionLedgerBuild, right: EvictionLedgerBuild): number {
  return right.lastPlayedAt - left.lastPlayedAt || right.firstPlayedAt - left.firstPlayedAt || right.key.localeCompare(left.key);
}

function compareOldest(left: EvictionLedgerBuild, right: EvictionLedgerBuild): number {
  return -compareNewest(left, right);
}

function groupByGame(builds: EvictionLedgerBuild[]): Map<string, EvictionLedgerBuild[]> {
  const games = new Map<string, EvictionLedgerBuild[]>();
  for (const build of builds) {
    const gameBuilds = games.get(build.gameId) ?? [];
    gameBuilds.push(build);
    games.set(build.gameId, gameBuilds);
  }
  return games;
}

function retainedBuilds(builds: EvictionLedgerBuild[], now: number): Set<string> {
  const retained = new Set<string>();
  const cutoff = now - CACHE_EVICTION_POLICY.retentionMs;

  for (const gameBuilds of groupByGame(builds).values()) {
    const newest = [...gameBuilds].sort(compareNewest);
    if (newest[0]) retained.add(newest[0].key);

    for (const build of newest) {
      if (build.channel !== 'draft' && build.lastPlayedAt > cutoff) retained.add(build.key);
    }

    for (const draft of newest.filter((build) => build.channel === 'draft').slice(0, CACHE_EVICTION_POLICY.draftsPerGame)) {
      retained.add(draft.key);
    }
  }

  return retained;
}

function enforceBudget(builds: EvictionLedgerBuild[], retained: Set<string>, quota: number | undefined): void {
  const budget = Math.min(CACHE_EVICTION_POLICY.maxBytes, (quota ?? Infinity) * CACHE_EVICTION_POLICY.quotaRatio);
  let retainedBytes = builds.reduce((total, build) => total + (retained.has(build.key) ? build.bytes : 0), 0);
  if (retainedBytes <= budget) return;

  const candidates = builds
    .filter((build) => retained.has(build.key))
    .sort((left, right) => {
      const draftOrder = Number(right.channel === 'draft') - Number(left.channel === 'draft');
      return draftOrder || compareOldest(left, right);
    });

  for (const build of candidates) {
    retained.delete(build.key);
    retainedBytes -= build.bytes;
    if (retainedBytes <= budget) break;
  }
}

function blobHash(request: Request): string | undefined {
  const match = new URL(request.url).pathname.match(/^\/a\/([^/.]+)\.[^/]+$/);
  return match?.[1];
}

function cachedBuildKey(request: Request): string | undefined {
  const match = new URL(request.url).pathname.match(/^\/g\/([^/]+)\/([^/]+)\//);
  if (!match) return undefined;
  return `${decodeURIComponent(match[1] ?? '')}/${decodeURIComponent(match[2] ?? '')}`;
}

async function deleteUnretainedEntries(
  dependencies: CacheEvictionDependencies,
  builds: EvictionLedgerBuild[],
  retained: Set<string>,
): Promise<void> {
  const liveHashes = new Set(
    builds.filter((build) => retained.has(build.key)).flatMap((build) => build.hashes),
  );
  const [blobs, buildCache] = await Promise.all([
    dependencies.caches.open(BLOB_CACHE),
    dependencies.caches.open(BUILD_CACHE),
  ]);
  const [blobRequests, buildRequests] = await Promise.all([blobs.keys(), buildCache.keys()]);

  await Promise.all([
    ...blobRequests.filter((request) => !liveHashes.has(blobHash(request) ?? '')).map((request) => blobs.delete(request)),
    ...buildRequests
      .filter((request) => !retained.has(cachedBuildKey(request) ?? ''))
      .map((request) => buildCache.delete(request)),
  ]);
}

export async function evictAssetCaches(dependencies: CacheEvictionDependencies): Promise<void> {
  await dependencies.locks.request('gm-cache', { mode: 'exclusive', ifAvailable: true }, async (lock) => {
    if (!lock) return;

    const [builds, estimate] = await Promise.all([dependencies.ledger.list(), dependencies.storage.estimate()]);
    const retained = retainedBuilds(builds, (dependencies.now ?? Date.now)());
    enforceBudget(builds, retained, estimate.quota);
    await deleteUnretainedEntries(dependencies, builds, retained);

    const dropped = builds.filter((build) => !retained.has(build.key)).map((build) => build.key);
    if (dropped.length > 0) await dependencies.ledger.delete(dropped);
  });
}

export function scheduleAssetCacheEviction(
  dependencies: CacheEvictionDependencies,
  scheduler: IdleScheduler = globalThis,
): void {
  const run = () => {
    void evictAssetCaches(dependencies).catch(() => undefined);
  };

  if (scheduler.requestIdleCallback) {
    scheduler.requestIdleCallback(run, { timeout: CACHE_EVICTION_POLICY.idleTimeoutMs });
  } else {
    scheduler.setTimeout(run, CACHE_EVICTION_POLICY.idleTimeoutMs);
  }
}
