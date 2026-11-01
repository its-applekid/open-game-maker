import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from 'octokit';

import { withSafeGitHubRequests } from '../github-request.js';
import type {
  AuthenticatedGitHub,
  GitHubApp,
  GitHubIdentity,
  GitHubRequest,
} from '../types.js';
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
};

export async function createGitHubApp(config: GitHubAppConfig): Promise<GitHubApp> {
  const privateKey = await readPrivateKey(config.privateKeyPath);
  const now = config.now ?? Date.now;
  const auth = createAppAuth({ appId: config.appId, privateKey });
  const appClient = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId: config.appId, privateKey },
    request: { fetch: config.fetch },
  });
  const installations = new Map<string, CachedInstallation>();
  const tokens = new Map<number, CachedToken>();
  let identityValue: GitHubIdentity | undefined;

  async function installationFor(owner: string): Promise<CachedInstallation> {
    const key = owner.toLowerCase();
    const cached = installations.get(key);
    if (cached !== undefined && now() - cached.fetchedAt < 10 * 60_000) return cached;

    const response = await appClient.request('GET /app/installations', { per_page: 100 });
    const match = (response.data as Installation[]).find(
      (installation) => installation.account?.login?.toLowerCase() === key,
    );
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
        request: { fetch: config.fetch },
      });
      const request = client.request.bind(client) as unknown as GitHubRequest;
      return { accountType: installation.accountType, request: withSafeGitHubRequests(request) };
    },
    async identity(): Promise<GitHubIdentity> {
      if (identityValue !== undefined) return identityValue;
      const response = await appClient.request('GET /app');
      const slug = response.data.slug;
      identityValue = {
        name: `${slug}[bot]`,
        email: `${slug}[bot]@users.noreply.github.com`,
      };
      return identityValue;
    },
  };
}
