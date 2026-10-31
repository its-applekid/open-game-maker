// The studio's local cache: every file the site serves is kept on the device after its first download, so the title
// town (models, terrain, sounds, the bundled script) loads from the phone itself next time. deploy.sh stamps BUILD on
// each deploy; a new stamp installs a fresh cache and drops the old one. Pages go to the network first (cache offline).
// Big assets (sounds, models, art) live in a cache that survives deploys: served from it at once and refreshed in the
// background, so a deploy that didn't touch them costs a phone nothing. The baked town files change with the code, so
// they stay in the per-deploy cache.
const BUILD = '__BUILD__', CACHE = 'ogm-' + BUILD, ASSETS = 'ogm-assets';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== ASSETS).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.endsWith('/sw.js')) return;
  const keep = res => { if (res.ok && res.type === 'basic') { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)); } return res; };
  if (r.mode === 'navigate') { e.respondWith(fetch(r).then(keep).catch(() => caches.match(r))); return; }
  if (/\/(town\/models|art)\//.test(u.pathname) && !u.pathname.includes('/bake/')) {   // stale-while-revalidate
    e.respondWith(caches.open(ASSETS).then(c => c.match(r).then(hit => { const net = fetch(r).then(res => { if (res.ok && res.type === 'basic') c.put(r, res.clone()); return res; }); if (hit) net.catch(() => {}); return hit || net; })));
    return;
  }
  e.respondWith(caches.match(r, { ignoreSearch: false }).then(hit => hit || fetch(r).then(keep)));
});
