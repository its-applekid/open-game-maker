export async function registerGameCache(url = '/game-cache.js'): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined;
  return navigator.serviceWorker.register(url, { scope: '/g/' });
}
