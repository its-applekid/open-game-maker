import { createAppAuth } from '@octokit/auth-app';
import { request as octokitRequest } from '@octokit/request';
import { Octokit } from 'octokit';

import { fetchWithTimeout } from '../fetch-timeout.js';
import { withSafeGitHubRequests } from '../github-request.js';
import type { AuthenticatedGitHub, GitHubApp, GitHubIdentity, GitHubRequest } from '../types.js';
import { readPrivateKey } from './private-key.js';

type Clock = () => number;
type Installation = { id: number; account?: { login?: string; type?: string } | null };
type CachedInstallation = {
  id: number;
  accountType: 'Organization' | 'User';
  fetchedAt: number;
};
type CachedToken = { token: string; expiresAt: number };

export class AppNotInstalledError extends Error {
  constructor(owner: string) {
    super(`GitHub App is not installed for ${owner}`);
    this.name = 'AppNotInstalledError';
  }
}

export type GitHubAppConfig = {
  appId: string;
  privateKeyPath: string;
  fetch?: typeof fetch;
  now?: Clock;
  timeoutMs?: number;
};

export async function createGitHubApp(config: GitHubAppConfig): Promise<GitHubApp> {
  const privateKey = await readPrivateKey(config.privateKeyPath);
  const now = config.now ?? Date.now;
  const boundedFetch = fetchWithTimeout(config.fetch ?? fetch, config.timeoutMs);
  const rawRequest = octokitRequest.defaults({ request: { fetch: boundedFetch } });
  const request = Object.assign(withSafeGitHubRequests(rawRequest as unknown as GitHubRequest), {
    endpoint: rawRequest.endpoint,
    defaults: rawRequest.defaults,
  }) as typeof rawRequest;
  const auth = createAppAuth({ appId: config.appId, privateKey, request });
  const appClient = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId: config.appId, privateKey },
    request: { fetch: boundedFetch },
    retry: { enabled: false },
    throttle: { enabled: false },
  });
  const appRequest = withSafeGitHubRequests(appClient.request.bind(appClient) as unknown as GitHubRequest);
  const installations = new Map<string, CachedInstallation>();
  const tokens = new Map<number, CachedToken>();
  let identityValue: GitHubIdentity | undefined;

  async function installationFor(owner: string): Promise<CachedInstallation> {
    const key = owner.toLowerCase();
    const cached = installations.get(key);
    if (cached !== undefined && now() - cached.fetchedAt < 10 * 60_000) return cached;

    let match: Installation | undefined;
    for (let page = 1; match === undefined; page += 1) {
      const response = await appRequest<Installation[]>('GET /app/installations', { per_page: 100, page });
      match = response.data.find((installation) => installation.account?.login?.toLowerCase() === key);
      if (response.data.length < 100) break;
    }
    if (match?.account?.type !== 'Organization' && match?.account?.type !== 'User') {
      throw new AppNotInstalledError(owner);
    }
    const resolved: CachedInstallation = {
      id: match.id,
      accountType: match.account.type,
      fetchedAt: now(),
    };
    installations.set(key, resolved);
    return resolved;
  }

  async function tokenFor(installationId: number): Promise<string> {
    const cached = tokens.get(installationId);
    if (cached !== undefined && cached.expiresAt - now() > 5 * 60_000) return cached.token;
    const authentication = await auth({
      type: 'installation',
      installationId,
      refresh: cached !== undefined,
    });
    tokens.set(installationId, {
      token: authentication.token,
      expiresAt: Date.parse(authentication.expiresAt),
    });
    return authentication.token;
  }

  return {
    async forOwner(owner: string): Promise<AuthenticatedGitHub> {
      const installation = await installationFor(owner);
      const client = new Octokit({
        auth: await tokenFor(installation.id),
        request: { fetch: boundedFetch },
        retry: { enabled: false },
        throttle: { enabled: false },
      });
      const request = client.request.bind(client) as unknown as GitHubRequest;
      return { accountType: installation.accountType, request: withSafeGitHubRequests(request) };
    },
    async identity(): Promise<GitHubIdentity> {
      if (identityValue !== undefined) return identityValue;
      const response = await appRequest<{ slug: string }>('GET /app');
      if (response.data === null) throw new Error('GitHub App identity response was empty');
      const slug = response.data.slug;
      identityValue = {
        name: `${slug}[bot]`,
        email: `${slug}[bot]@users.noreply.github.com`,
      };
      return identityValue;
    },
  };
}
