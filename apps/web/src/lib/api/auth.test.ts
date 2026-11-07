import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_REQUEST_TIMEOUT_MS,
  getAuthCapabilities,
  connectGitHubInstallation,
  getGitHubStatus,
  gitHubInstallUrl,
  getRepoVisibilityDefault,
  readGitHubInstallState,
  safeNext,
  setRepoVisibilityDefault,
} from './auth';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
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

  it('posts the installation id with the OAuth code that proves ownership', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(JSON.stringify({ connected: true, login: 'octocat' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(connectGitHubInstallation('4242', 'code-abc')).resolves.toEqual({
      connected: true,
      login: 'octocat',
    });
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/v1/github/connect');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ installationId: '4242', code: 'code-abc' }),
    });
  });

  it('builds the App installation URL with a tab nonce and next as state, or null without a slug', () => {
    const url = new URL(gitHubInstallUrl('/games', 'ogm-app') ?? '');
    const nonce = sessionStorage.getItem('ogm.githubInstallState');

    expect(`${url.origin}${url.pathname}`).toBe('https://github.com/apps/ogm-app/installations/new');
    expect(nonce).toMatch(/^[0-9a-f-]{36}$/);
    expect(url.searchParams.get('state')).toBe(`${nonce}:/games`);
    expect(gitHubInstallUrl('/games', '')).toBeNull();
  });

  it('accepts only the install state this tab started, once', () => {
    const state = new URL(gitHubInstallUrl('/g/1?x=a:b', 'ogm-app') ?? '').searchParams.get('state');

    expect(readGitHubInstallState('someone-else:/games')).toBeNull();
    expect(readGitHubInstallState(null)).toBeNull();
    expect(readGitHubInstallState(state)).toBe('/g/1?x=a:b');
    expect(readGitHubInstallState(state)).toBeNull();
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
});
