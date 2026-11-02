import { generateKeyPairSync } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGitHubApp } from '../src/auth/app.js';
import { createCommitApp } from '../src/server.js';
import type { GitHubInstallations } from '../src/types.js';
import { contextWith, fakeRequest } from './helpers.js';

// The API learns which GitHub account a creator installed the App on only through this lookup, so
// the browser never supplies (and can never forge) the login stored for that creator.

const serviceToken = 't'.repeat(32);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

function serve(installationLogin: GitHubInstallations['installationLogin'], remote = '127.0.0.1') {
  const { request } = fakeRequest(() => ({}));
  const { repos, ...operations } = contextWith(request);
  return createCommitApp({
    serviceToken,
    operations,
    repos,
    audit: { async append() {} },
    installations: { installationLogin },
    remoteAddress: () => remote,
  });
}

const bearer = { authorization: `Bearer ${serviceToken}` };

describe('installation lookup route', () => {
  it('answers the account login for an installation id', async () => {
    const lookup = vi.fn(async () => 'octocat');
    const response = await serve(lookup).request('/internal/installations/42', { headers: bearer });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ login: 'octocat' });
    expect(lookup).toHaveBeenCalledWith(42);
  });

  it('answers 404 for an unknown or malformed installation id', async () => {
    const lookup = vi.fn(async () => null);
    const app = serve(lookup);
    expect((await app.request('/internal/installations/7', { headers: bearer })).status).toBe(404);
    expect((await app.request('/internal/installations/7x', { headers: bearer })).status).toBe(404);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('answers 502 when GitHub fails', async () => {
    const app = serve(async () => {
      throw new Error('down');
    });
    expect((await app.request('/internal/installations/7', { headers: bearer })).status).toBe(502);
  });

  it('requires the service bearer and a loopback peer', async () => {
    const lookup = vi.fn(async () => 'octocat');
    expect((await serve(lookup).request('/internal/installations/42')).status).toBe(401);
    expect((await serve(lookup, '10.0.0.9').request('/internal/installations/42', { headers: bearer })).status).toBe(
      403,
    );
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

describe('GitHub App installation login', () => {
  it('reads the installation account with App credentials and maps a missing installation to null', async () => {
    const seen: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const target = typeof input === 'string' || input instanceof URL ? input : input.url;
      const url = new URL(target);
      const headers = new Headers(init?.headers);
      seen.push(`${url.pathname} ${headers.get('authorization')?.split(' ')[0]}`);
      if (url.pathname === '/app/installations/42') {
        return new Response(JSON.stringify({ id: 42, account: { login: 'octocat', type: 'User' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    };
    const app = await createGitHubApp({ appId: '123', privateKeyPath: await privateKeyFile(), fetch: fetchImpl });

    await expect(app.installationLogin(42)).resolves.toBe('octocat');
    await expect(app.installationLogin(9)).resolves.toBeNull();
    expect(seen[0]).toBe('/app/installations/42 bearer');
  });
});
