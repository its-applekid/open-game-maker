import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_REQUEST_TIMEOUT_MS,
  getAuthCapabilities,
  connectGitHubInstallation,
  getGitHubStatus,
  gitHubInstallUrl,
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

  it('reads the GitHub connection the API stored, not Better Auth accounts', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ connected: true, login: 'octocat' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(getGitHubStatus()).resolves.toEqual({ connected: true, login: 'octocat' });
    expect(fetch).toHaveBeenCalledWith('/api/v1/github/connection', expect.anything());
  });

  it('posts only the installation id when connecting', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(JSON.stringify({ connected: true, login: 'octocat' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(connectGitHubInstallation('4242')).resolves.toEqual({ connected: true, login: 'octocat' });
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/v1/github/connect');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ installationId: '4242' }),
    });
  });

  it('builds the App installation URL with next as state, or null without a slug', () => {
    expect(gitHubInstallUrl('/games', 'ogm-app')).toBe(
      'https://github.com/apps/ogm-app/installations/new?state=%2Fgames',
    );
    expect(gitHubInstallUrl('/games', '')).toBeNull();
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
