import { beforeEach, describe, expect, it } from 'vitest';

import { applyHashRedirect } from './hashRedirect';

describe('legacy hash redirects', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it.each([
    ['#library', '/games'],
    ['#new', '/new'],
  ])('replaces %s with %s', (hash, path) => {
    window.history.replaceState(null, '', `/${hash}`);

    applyHashRedirect();

    expect(window.location.pathname).toBe(path);
    expect(window.location.hash).toBe('');
  });

  it('leaves unknown hashes unchanged', () => {
    window.history.replaceState(null, '', '/#credits');

    applyHashRedirect();

    expect(window.location.hash).toBe('#credits');
  });
});
