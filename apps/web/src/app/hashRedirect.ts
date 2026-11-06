const legacyHashes = new Map([
  ['#library', '/all'],
  ['#new', '/new'],
]);

export function applyHashRedirect(): void {
  const destination = legacyHashes.get(window.location.hash);
  if (!destination) return;

  window.history.replaceState(window.history.state, '', `${destination}${window.location.search}`);
}
