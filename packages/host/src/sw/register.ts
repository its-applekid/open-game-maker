export async function registerGameCache(url = '/game-cache.js'): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined;
  try {
    return await navigator.serviceWorker.register(url, { scope: '/g/' });
  } catch {
    return undefined;
  }
}
