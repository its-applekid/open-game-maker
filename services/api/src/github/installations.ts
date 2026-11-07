import type { GitHubInstallationLookup } from '../app/registry.js';

// The commit service alone holds the GitHub App credentials. A login is answered only for an installation the user
// who authorized the OAuth `code` controls, so an installation id learned from anywhere else proves nothing.
export class GitHubOAuthUnavailableError extends Error {
  constructor() {
    super('commit service has no GitHub App OAuth client configured');
    this.name = 'GitHubOAuthUnavailableError';
  }
}

export class CommitServiceInstallationLookup implements GitHubInstallationLookup {
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #fetch: typeof fetch;

  constructor(input: { baseUrl: string; token: string; fetch?: typeof fetch }) {
    this.#baseUrl = input.baseUrl.replace(/\/$/, '');
    this.#token = input.token;
    this.#fetch = input.fetch ?? fetch;
  }

  async loginFor(installationId: string, code: string): Promise<string | null> {
    const response = await this.#fetch(
      `${this.#baseUrl}/internal/installations/${encodeURIComponent(installationId)}/ownership`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${this.#token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    return this.#login(response);
  }

  async revalidate(installationId: string): Promise<string | null> {
    const response = await this.#fetch(
      `${this.#baseUrl}/internal/installations/${encodeURIComponent(installationId)}`,
      {
        headers: { authorization: `Bearer ${this.#token}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    return this.#login(response);
  }

  async #login(response: Response): Promise<string | null> {
    if (response.status === 404) return null;
    const result = (await response.json().catch(() => null)) as { login?: unknown; error?: unknown } | null;
    if (response.status === 503 && result?.error === 'github_oauth_unavailable') {
      throw new GitHubOAuthUnavailableError();
    }
    if (!response.ok || typeof result?.login !== 'string') {
      throw new Error(`commit service refused installation lookup (${response.status})`);
    }
    return result.login;
  }
}
