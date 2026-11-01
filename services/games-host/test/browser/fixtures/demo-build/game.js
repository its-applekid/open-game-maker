/* global URLSearchParams, document, fetch, window */

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

window.__probe = {
  cookie: document.cookie,
  fetchOutside,
  parentDocument,
};
document.querySelector('#ready').textContent = 'ready';
