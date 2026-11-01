import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_REQUEST_TIMEOUT_MS,
  getAuthCapabilities,
  getGitHubStatus,
  getRepoVisibilityDefault,
  isAgeRequiredError,
  requireAge,
  safeNext,
  setRepoVisibilityDefault,
} from './auth';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/signin');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('auth client helpers', () => {
  it('reads the configured sign-in methods from the same-origin auth route', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ providers: ['magic-link', 'passkey'] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(getAuthCapabilities()).resolves.toEqual({ providers: ['magic-link', 'passkey'] });
    expect(fetch).toHaveBeenCalledWith('/auth/providers', expect.objectContaining({ credentials: 'include' }));
  });

  it('aborts a stalled same-origin auth request at the client deadline', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
        }),
    );
    vi.stubGlobal('fetch', fetch);

    const request = expect(getAuthCapabilities()).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(AUTH_REQUEST_TIMEOUT_MS);

    await request;
    vi.useRealTimers();
  });

  it('reports a connected GitHub login from Better Auth accounts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify([{ providerId: 'github', accountId: 'octocat' }]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    await expect(getGitHubStatus()).resolves.toEqual({ connected: true, login: 'octocat' });
  });

  it('reports GitHub as disconnected when no account is linked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    await expect(getGitHubStatus()).resolves.toEqual({ connected: false });
  });

  it('uses private visibility by default and persists an explicit choice', () => {
    expect(getRepoVisibilityDefault()).toBe('private');
    setRepoVisibilityDefault('public');
    expect(getRepoVisibilityDefault()).toBe('public');
    expect(localStorage.getItem('ogm.repoVisibility')).toBe('public');
  });

  it('keeps next destinations on this origin', () => {
    expect(safeNext('/games?sort=recent', '/signin')).toBe('/games?sort=recent');
    expect(safeNext('//example.com', '/signin')).toBe('/signin');
    expect(safeNext('/\\example.com', '/signin')).toBe('/signin');
  });

  it('recognizes the backend age-required response and routes back through the gate', async () => {
    expect(isAgeRequiredError({ status: 403, code: 'AGE_REQUIRED' })).toBe(true);
    expect(isAgeRequiredError({ status: 403, body: { code: 'age_required' } })).toBe(true);

    await requireAge('/signin?next=%2Fgames');

    expect(`${location.pathname}${location.search}`).toBe('/age?next=%2Fsignin%3Fnext%3D%252Fgames');
  });
});
