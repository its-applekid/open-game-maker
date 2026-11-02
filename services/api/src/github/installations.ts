import type { GitHubInstallationLookup } from '../app/registry.js';

// Asks the commit service, which alone holds the GitHub App credentials, whose account an installation is on.
export class CommitServiceInstallationLookup implements GitHubInstallationLookup {
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #fetch: typeof fetch;

  constructor(input: { baseUrl: string; token: string; fetch?: typeof fetch }) {
    this.#baseUrl = input.baseUrl.replace(/\/$/, '');
    this.#token = input.token;
    this.#fetch = input.fetch ?? fetch;
  }

  async loginFor(installationId: string): Promise<string | null> {
    const response = await this.#fetch(
      `${this.#baseUrl}/internal/installations/${encodeURIComponent(installationId)}`,
      {
        headers: { authorization: `Bearer ${this.#token}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (response.status === 404) return null;
    const result = (await response.json().catch(() => null)) as { login?: unknown } | null;
    if (!response.ok || typeof result?.login !== 'string') {
      throw new Error(`commit service refused installation lookup (${response.status})`);
    }
    return result.login;
  }
}
