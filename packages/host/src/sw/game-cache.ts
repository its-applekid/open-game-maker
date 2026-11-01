export const ASSET_CACHE = 'gm-assets';
export const PAGE_CACHE = 'gm-pages';

export type CacheRoute =
  { strategy: 'pass' } | { strategy: 'network-first' | 'cache-first' | 'stale-while-revalidate'; cacheName: string };

export function classifyGameRequest(request: Request, workerOrigin = location.origin): CacheRoute {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== workerOrigin || !url.pathname.startsWith('/g/')) {
    return { strategy: 'pass' };
  }
  if (request.mode === 'navigate' || /^\/g\/[^/]+\/[^/]+\/index\.html$/.test(url.pathname)) {
    return { strategy: 'network-first', cacheName: PAGE_CACHE };
  }
  if (/^\/g\/[^/]+\/[^/]+\/assets\//.test(url.pathname)) {
    return { strategy: 'cache-first', cacheName: ASSET_CACHE };
  }
  return { strategy: 'stale-while-revalidate', cacheName: PAGE_CACHE };
}

interface ExtendableEventLike extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEventLike extends ExtendableEventLike {
  request: Request;
  respondWith(response: Promise<Response>): void;
}

interface WorkerScopeLike {
  location: Location;
  caches: CacheStorage;
  clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: string, listener: (event: never) => void): void;
}

const worker = globalThis as unknown as WorkerScopeLike;

if (typeof worker.addEventListener === 'function' && 'clients' in worker) {
  worker.addEventListener('install', ((event: ExtendableEventLike) => {
    event.waitUntil(worker.skipWaiting());
  }) as (event: never) => void);
  worker.addEventListener('activate', ((event: ExtendableEventLike) => {
    event.waitUntil(
      worker.caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys.filter((key) => key !== ASSET_CACHE && key !== PAGE_CACHE).map((key) => worker.caches.delete(key)),
          ),
        )
        .then(() => worker.clients.claim()),
    );
  }) as (event: never) => void);
  worker.addEventListener('fetch', ((event: FetchEventLike) => {
    const route = classifyGameRequest(event.request, worker.location.origin);
    if (route.strategy === 'pass') return;
    if (route.strategy === 'network-first') event.respondWith(networkFirst(event.request, route.cacheName));
    if (route.strategy === 'cache-first') event.respondWith(cacheFirst(event.request, route.cacheName));
    if (route.strategy === 'stale-while-revalidate') {
      event.respondWith(staleWhileRevalidate(event.request, route.cacheName, event));
    }
  }) as (event: never) => void);
}

async function networkFirst(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(new Request(request, { cache: 'no-cache' }));
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(
  request: Request,
  cacheName: string,
  event: ExtendableEventLike,
): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fresh = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  });
  if (cached) {
    event.waitUntil(fresh.then(() => undefined));
    return cached;
  }
  return fresh;
}
