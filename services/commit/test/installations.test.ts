import { generateKeyPairSync } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGitHubApp, GitHubOAuthNotConfiguredError } from '../src/auth/app.js';
import { createCommitApp } from '../src/server.js';
import type { GitHubInstallations } from '../src/types.js';
import { contextWith, fakeRequest } from './helpers.js';

// The API learns which GitHub account a creator installed the App on only through this lookup, so the browser never
// supplies (and can never forge) the login stored for that creator. An installation id alone proves nothing: a
// login is answered only when the OAuth code the creator authorized lists that installation for their user token.

const serviceToken = 't'.repeat(32);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

const notOwned: GitHubInstallations['installationLoginForUser'] = async () => null;

function serve(
  lookups: {
    installationLogin: GitHubInstallations['installationLogin'];
    installationLoginForUser?: GitHubInstallations['installationLoginForUser'];
  },
  remote = '127.0.0.1',
) {
  const { request } = fakeRequest(() => ({}));
  const { repos, ...operations } = contextWith(request);
  return createCommitApp({
    serviceToken,
    operations,
    repos,
    audit: { async append() {} },
    installations: {
      installationLogin: lookups.installationLogin,
      installationLoginForUser: lookups.installationLoginForUser ?? notOwned,
    },
    remoteAddress: () => remote,
  });
}

const bearer = { authorization: `Bearer ${serviceToken}` };

function ownership(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { ...bearer, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

describe('installation ownership route', () => {
  it('answers the login the authorized user controls', async () => {
    const proof = vi.fn(async () => 'octocat');
    const app = serve({ installationLogin: async () => null, installationLoginForUser: proof });
    const response = await app.request('/internal/installations/42/ownership', ownership({ code: 'code-abc_123' }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ login: 'octocat' });
    expect(proof).toHaveBeenCalledWith(42, 'code-abc_123');
  });

  it('answers 404 when the code does not list the installation for its user', async () => {
    const proof = vi.fn(async () => null);
    const app = serve({ installationLogin: async () => 'someone-else', installationLoginForUser: proof });
    const response = await app.request('/internal/installations/42/ownership', ownership({ code: 'spent-code' }));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'installation_not_found' });
    expect(proof).toHaveBeenCalledWith(42, 'spent-code');
  });

  it('refuses a missing, malformed or oversized code before asking GitHub', async () => {
    const proof = vi.fn(async () => 'octocat');
    const app = serve({ installationLogin: async () => null, installationLoginForUser: proof });
    for (const body of [{}, { code: '' }, { code: 'has space' }, { code: 'x'.repeat(256) }, { code: 7 }, 'code']) {
      const response = await app.request('/internal/installations/42/ownership', ownership(body));
      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual({ error: 'code_required' });
    }
    expect(proof).not.toHaveBeenCalled();
  });

  it('answers 404 for a malformed installation id without asking GitHub', async () => {
    const proof = vi.fn(async () => 'octocat');
    const app = serve({ installationLogin: async () => null, installationLoginForUser: proof });
    for (const id of ['0', '7x', '1234567890123456']) {
      const response = await app.request(`/internal/installations/${id}/ownership`, ownership({ code: 'abc' }));
      expect(response.status).toBe(404);
    }
    expect(proof).not.toHaveBeenCalled();
  });

  it('answers 503 when the App has no OAuth client configured', async () => {
    const app = serve({
      installationLogin: async () => null,
      installationLoginForUser: async () => {
        throw new GitHubOAuthNotConfiguredError();
      },
    });
    const response = await app.request('/internal/installations/42/ownership', ownership({ code: 'abc' }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'github_oauth_unavailable' });
  });

  it('answers 502 when GitHub fails', async () => {
    const app = serve({
      installationLogin: async () => null,
      installationLoginForUser: async () => {
        throw new Error('down');
      },
    });
    expect((await app.request('/internal/installations/42/ownership', ownership({ code: 'abc' }))).status).toBe(502);
  });

  it('requires the service bearer and a loopback peer', async () => {
    const proof = vi.fn(async () => 'octocat');
    const app = serve({ installationLogin: async () => null, installationLoginForUser: proof });
    const anonymous: RequestInit = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'abc' }),
    };
    expect((await app.request('/internal/installations/42/ownership', anonymous)).status).toBe(401);
    expect((await app.request('/internal/installations/42/ownership', ownership({ code: 'abc' }))).status).toBe(200);
    expect(proof).toHaveBeenCalledTimes(1);

    const remote = serve({ installationLogin: async () => null, installationLoginForUser: proof }, '10.0.0.9');
    expect((await remote.request('/internal/installations/42/ownership', ownership({ code: 'abc' }))).status).toBe(403);
    expect(proof).toHaveBeenCalledTimes(1);
  });
});

describe('installation lookup route', () => {
  it('answers the account login for an installation id', async () => {
    const lookup = vi.fn(async () => 'octocat');
    const response = await serve({ installationLogin: lookup }).request('/internal/installations/42', {
      headers: bearer,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ login: 'octocat' });
    expect(lookup).toHaveBeenCalledWith(42);
  });

  it('answers 404 for an unknown or malformed installation id', async () => {
    const lookup = vi.fn(async () => null);
    const app = serve({ installationLogin: lookup });
    expect((await app.request('/internal/installations/7', { headers: bearer })).status).toBe(404);
    expect((await app.request('/internal/installations/7x', { headers: bearer })).status).toBe(404);
    expect((await app.request('/internal/installations/1234567890123456', { headers: bearer })).status).toBe(404);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('answers 502 when GitHub fails', async () => {
    const app = serve({
      installationLogin: async () => {
        throw new Error('down');
      },
    });
    expect((await app.request('/internal/installations/7', { headers: bearer })).status).toBe(502);
  });

  it('requires the service bearer and a loopback peer', async () => {
    const lookup = vi.fn(async () => 'octocat');
    expect((await serve({ installationLogin: lookup }).request('/internal/installations/42')).status).toBe(401);
    expect(
      (
        await serve({ installationLogin: lookup }, '10.0.0.9').request('/internal/installations/42', {
          headers: bearer,
        })
      ).status,
    ).toBe(403);
    expect(lookup).not.toHaveBeenCalled();
  });
});

async function privateKeyFile(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ogm-app-installations-'));
  temporaryDirectories.push(directory);
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const file = path.join(directory, 'app.pem');
  await writeFile(file, privateKey, { mode: 0o600 });
  await chmod(file, 0o600);
  return file;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('GitHub App installation login', () => {
  it('reads the installation account with App credentials and maps a missing installation to null', async () => {
    const seen: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const target = typeof input === 'string' || input instanceof URL ? input : input.url;
      const url = new URL(target);
      const headers = new Headers(init?.headers);
      seen.push(`${url.pathname} ${headers.get('authorization')?.split(' ')[0]}`);
      if (url.pathname === '/app/installations/42') {
        return json({ id: 42, account: { login: 'octocat', type: 'User' } });
      }
      return json({ message: 'Not Found' }, 404);
    };
    const app = await createGitHubApp({ appId: '123', privateKeyPath: await privateKeyFile(), fetch: fetchImpl });

    await expect(app.installationLogin(42)).resolves.toBe('octocat');
    await expect(app.installationLogin(9)).resolves.toBeNull();
    expect(seen[0]).toBe('/app/installations/42 bearer');
  });
});

describe('GitHub App ownership proof', () => {
  /* A fake GitHub: the code exchange, then the user's installations. */
  function github(options: { exchange?: () => Response; installations?: (page: number) => Response }): {
    fetchImpl: typeof fetch;
    calls: string[];
  } {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const target = typeof input === 'string' || input instanceof URL ? input : input.url;
      const url = new URL(target);
      const headers = new Headers(init?.headers);
      if (url.origin === 'https://github.com') {
        calls.push(`${init?.method ?? 'GET'} ${url.pathname} ${headers.get('accept')}`);
        return options.exchange?.() ?? json({ access_token: 'gho_user_token' });
      }
      calls.push(`${init?.method ?? 'GET'} ${url.pathname} ${headers.get('authorization') ?? ''}`);
      return options.installations?.(Number(url.searchParams.get('page') ?? '1')) ?? json({ installations: [] });
    };
    return { fetchImpl, calls };
  }

  it('exchanges the code for a user token and answers the installation login that token can see', async () => {
    const { fetchImpl, calls } = github({
      installations: () =>
        json({ total_count: 1, installations: [{ id: 42, account: { login: 'octocat', type: 'User' } }] }),
    });
    const app = await createGitHubApp({
      appId: '123',
      privateKeyPath: await privateKeyFile(),
      clientId: 'client-id',
      clientSecret: 'client-secret',
      fetch: fetchImpl,
    });

    await expect(app.installationLoginForUser(42, 'code-abc')).resolves.toBe('octocat');
    expect(calls).toEqual([
      'POST /login/oauth/access_token application/json',
      'GET /user/installations Bearer gho_user_token',
    ]);
  });

  it('answers null when the user token cannot see the installation', async () => {
    const { fetchImpl } = github({
      installations: () =>
        json({ total_count: 1, installations: [{ id: 7, account: { login: 'someone-else', type: 'User' } }] }),
    });
    const app = await createGitHubApp({
      appId: '123',
      privateKeyPath: await privateKeyFile(),
      clientId: 'client-id',
      clientSecret: 'client-secret',
      fetch: fetchImpl,
    });

    await expect(app.installationLoginForUser(42, 'code-abc')).resolves.toBeNull();
  });

  it('answers null for a spent or forged code instead of reporting an outage', async () => {
    const { fetchImpl, calls } = github({
      exchange: () => json({ error: 'bad_verification_code', error_description: 'The code passed is incorrect.' }),
    });
    const app = await createGitHubApp({
      appId: '123',
      privateKeyPath: await privateKeyFile(),
      clientId: 'client-id',
      clientSecret: 'client-secret',
      fetch: fetchImpl,
    });

    await expect(app.installationLoginForUser(42, 'spent')).resolves.toBeNull();
    // The code was refused, so the user's installations are never read.
    expect(calls).toEqual(['POST /login/oauth/access_token application/json']);
  });

  it('reads the second page of the user installations', async () => {
    const pages: number[] = [];
    const { fetchImpl } = github({
      installations: (page) => {
        pages.push(page);
        if (page === 1) {
          return json({
            installations: Array.from({ length: 100 }, (_, index) => ({
              id: index + 1,
              account: { login: `owner-${index + 1}`, type: 'User' },
            })),
          });
        }
        return json({ installations: [{ id: 101, account: { login: 'alice', type: 'User' } }] });
      },
    });
    const app = await createGitHubApp({
      appId: '123',
      privateKeyPath: await privateKeyFile(),
      clientId: 'client-id',
      clientSecret: 'client-secret',
      fetch: fetchImpl,
    });

    await expect(app.installationLoginForUser(101, 'code-abc')).resolves.toBe('alice');
    expect(pages).toEqual([1, 2]);
  });

  it('throws when the App has no OAuth client id and secret', async () => {
    const { fetchImpl, calls } = github({});
    const app = await createGitHubApp({ appId: '123', privateKeyPath: await privateKeyFile(), fetch: fetchImpl });

    await expect(app.installationLoginForUser(42, 'code-abc')).rejects.toBeInstanceOf(GitHubOAuthNotConfiguredError);
    expect(calls).toEqual([]);
  });

  it('throws when GitHub refuses the exchange or the user installations', async () => {
    const refused = github({ exchange: () => json({ message: 'boom' }, 500) });
    const broken = github({ installations: () => json({ message: 'boom' }, 502) });
    const key = await privateKeyFile();
    const failing = await createGitHubApp({
      appId: '123',
      privateKeyPath: key,
      clientId: 'client-id',
      clientSecret: 'client-secret',
      fetch: refused.fetchImpl,
    });
    await expect(failing.installationLoginForUser(42, 'code-abc')).rejects.toThrow('500');

    const unreadable = await createGitHubApp({
      appId: '123',
      privateKeyPath: key,
      clientId: 'client-id',
      clientSecret: 'client-secret',
      fetch: broken.fetchImpl,
    });
    await expect(unreadable.installationLoginForUser(42, 'code-abc')).rejects.toThrow('502');
  });
});
