import type { RepoProvisioner } from '../app/registry.js';

export type { RepoProvisioner } from '../app/registry.js';

type ProvisionInput = Parameters<RepoProvisioner['provision']>[0];

export class NullRepoProvisioner implements RepoProvisioner {
  readonly calls: ProvisionInput[] = [];

  async provision(game: ProvisionInput): Promise<{ owner: string; repo: string; url: string }> {
    this.calls.push(game);
    const repo = `gm-${game.id}`;
    return { owner: game.owner.login, repo, url: `https://github.com/${game.owner.login}/${repo}` };
  }
}

export class CommitServiceRepoProvisioner implements RepoProvisioner {
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #templateRef: string;
  readonly #fetch: typeof fetch;

  constructor(input: { baseUrl: string; token: string; templateRef?: string; fetch?: typeof fetch }) {
    this.#baseUrl = input.baseUrl.replace(/\/$/, '');
    this.#token = input.token;
    this.#templateRef = input.templateRef ?? 'templates/game-2d@main';
    this.#fetch = input.fetch ?? fetch;
  }

  async provision(game: ProvisionInput): Promise<{ owner: string; repo: string; url: string }> {
    const response = await this.#fetch(`${this.#baseUrl}/internal/commit`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.#token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'create_repo',
        gameId: game.id,
        owner: game.owner.login,
        visibility: game.visibility,
        templateRef: this.#templateRef,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const result = (await response.json().catch(() => null)) as { ok?: boolean } | null;
    if (!response.ok || result?.ok !== true) throw new Error(`commit service refused create_repo (${response.status})`);
    const repo = `gm-${game.id}`;
    return { owner: game.owner.login, repo, url: `https://github.com/${game.owner.login}/${repo}` };
  }
}
