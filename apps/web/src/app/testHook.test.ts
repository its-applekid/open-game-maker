import { beforeEach, describe, expect, it, vi } from 'vitest';

import { installTestHook, registerTestApi } from './testHook';

describe('browser test hook', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    delete window.__ogmHost;
  });

  it('is absent without the test query parameter', () => {
    const router = fakeRouter('/');

    installTestHook(router);

    expect(window.__ogmHost).toBeUndefined();
  });

  it('reports navigation and registered screen APIs in test mode', () => {
    window.history.replaceState(null, '', '/?test');
    const router = fakeRouter('/');

    installTestHook(router);
    registerTestApi('games', { refresh: true });

    expect(window.__ogmHost?.version).toBe(1);
    expect(window.__ogmHost?.route()).toBe('/');
    expect(window.__ogmHost?.get('games')).toEqual({ refresh: true });
    expect(window.__ogmHost?.snapshot()).toEqual({
      route: '/',
      registered: ['games'],
    });
    window.__ogmHost?.navigate('/new');
    expect(router.navigate).toHaveBeenCalledWith('/new');
  });

  it('rejects duplicate registrations', () => {
    window.history.replaceState(null, '', '/?test');
    installTestHook(fakeRouter('/'));
    window.__ogmHost?.register('games', {});

    expect(() => window.__ogmHost?.register('games', {})).toThrow('already registered');
  });
});

function fakeRouter(pathname: string) {
  return {
    navigate: vi.fn(),
    state: { location: { pathname } },
  };
}
