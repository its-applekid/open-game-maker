import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerGameCache } from './register.js';

describe('registerGameCache', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the game-scope registration', async () => {
    const registration = {} as ServiceWorkerRegistration;
    const register = vi.fn().mockResolvedValue(registration);
    vi.stubGlobal('navigator', { serviceWorker: { register } });

    await expect(registerGameCache()).resolves.toBe(registration);
    expect(register).toHaveBeenCalledWith('/game-cache.js', { scope: '/g/' });
  });

  it('ignores unavailable and rejected service worker registration', async () => {
    vi.stubGlobal('navigator', {});
    await expect(registerGameCache()).resolves.toBeUndefined();

    const register = vi.fn().mockRejectedValue(new Error('private mode'));
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    await expect(registerGameCache()).resolves.toBeUndefined();
  });
});
