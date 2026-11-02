import type { Visibility } from '../types.js';

export type ActiveRepository = {
  gameId: string;
  owner: string;
  name: string;
  visibility: Visibility;
};

export interface BoundaryApi {
  activeRepositories(): Promise<ActiveRepository[]>;
  piiTerms(gameId: string): Promise<string[]>;
}

export class BoundaryApiError extends Error {
  constructor() {
    super('boundary API request failed');
    this.name = 'BoundaryApiError';
  }
}

export class BoundaryApiClient implements BoundaryApi {
  readonly #baseUrl: string;
  readonly #token: string;
  readonly #fetch: typeof fetch;

  constructor(options: { baseUrl: string; token: string; fetch?: typeof fetch }) {
    this.#baseUrl = options.baseUrl.replace(/\/$/u, '');
    this.#token = options.token;
    this.#fetch = options.fetch ?? fetch;
  }

  async #json(path: string): Promise<unknown> {
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      headers: {
        authorization: `Bearer ${this.#token}`,
        'x-ogm-service': 'commit',
      },
    });
    if (!response.ok) throw new BoundaryApiError();
    return response.json();
  }

  async activeRepositories(): Promise<ActiveRepository[]> {
    const body = await this.#json('/internal/games/active-repos');
    if (typeof body !== 'object' || body === null || !('repositories' in body) || !Array.isArray(body.repositories)) {
      throw new BoundaryApiError();
    }
    return body.repositories as ActiveRepository[];
  }

  async piiTerms(gameId: string): Promise<string[]> {
    const body = await this.#json(`/internal/games/${encodeURIComponent(gameId)}/pii-terms`);
    if (typeof body !== 'object' || body === null || !('terms' in body) || !Array.isArray(body.terms)) {
      throw new BoundaryApiError();
    }
    return body.terms.filter((term): term is string => typeof term === 'string');
  }
}
