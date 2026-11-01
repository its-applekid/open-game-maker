import type { Repository } from './types.js';
import { fetchWithTimeout } from './fetch-timeout.js';

type Fetch = typeof fetch;

export class RepoResolver {
  private readonly fetchImpl: Fetch;

  constructor(
    private readonly internalUrl: string,
    private readonly serviceToken: string,
    fetchImpl: Fetch = fetch,
    timeoutMs?: number,
  ) {
    this.fetchImpl = fetchWithTimeout(fetchImpl, timeoutMs);
  }

  async resolve(gameId: string): Promise<Repository> {
    const response = await this.fetchImpl(
      `${this.internalUrl.replace(/\/$/u, '')}/internal/games/${encodeURIComponent(gameId)}/repo`,
      { headers: { authorization: `Bearer ${this.serviceToken}` } },
    );
    if (!response.ok) throw new Error(`repository lookup failed (${response.status})`);

    const value: unknown = await response.json();
    if (!isRepository(value)) throw new Error('repository lookup returned an invalid response');
    return value;
  }
}

function isRepository(value: unknown): value is Repository {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.owner === 'string' &&
    typeof candidate.name === 'string' &&
    (candidate.visibility === 'private' || candidate.visibility === 'public')
  );
}
