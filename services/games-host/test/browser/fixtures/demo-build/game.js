/* global URLSearchParams, document, fetch, navigator, window */

const outside = new URLSearchParams(window.location.search).get('outside');

let parentDocument = 'visible';
try {
  void window.parent.document;
} catch {
  parentDocument = 'blocked';
}

const fetchOutside = await fetch(outside).then(
  () => 'allowed',
  () => 'blocked',
);

const serviceWorkerScope = await navigator.serviceWorker.register('/game-cache.js', { scope: '/g/' }).then(
  (registration) => registration.scope,
  () => 'unavailable',
);

window.__probe = {
  cookie: document.cookie,
  fetchOutside,
  parentDocument,
  serviceWorkerScope,
};
document.querySelector('#ready').textContent = 'ready';
