import type { GitHubApp } from '../types.js';
import type { BoundaryApi } from './api-client.js';
import type { BlocklistLoader } from './blocklist.js';
import { BoundaryCheckPoster } from './check-run.js';
import { evaluateDiff } from './evaluate.js';
import { buildDiffInput } from './inputs.js';
import type { BoundaryCheckRequest } from './poller.js';

export class BoundaryChecker {
  readonly #app: GitHubApp;
  readonly #api: BoundaryApi;
  readonly #blocklist: BlocklistLoader;
  readonly #poster: BoundaryCheckPoster;

  constructor(options: { app: GitHubApp; api: BoundaryApi; blocklist: BlocklistLoader; poster?: BoundaryCheckPoster }) {
    this.#app = options.app;
    this.#api = options.api;
    this.#blocklist = options.blocklist;
    this.#poster = options.poster ?? new BoundaryCheckPoster();
  }

  async check(request: BoundaryCheckRequest): Promise<void> {
    const github = await this.#app.forOwner(request.repository.owner);
    if (await this.#poster.exists(github.request, request.repository, request.pull.headSha)) return;
    const [blocklist, profileNames] = await Promise.all([this.#blocklist.load(), this.#api.piiTerms(request.gameId)]);
    const built = await buildDiffInput({
      request: github.request,
      repository: request.repository,
      prNumber: request.pull.number,
      pull: request.pull,
      blocklist,
      profileNames,
    });
    const verdict = evaluateDiff(built.input);
    await this.#poster.post(github.request, request.repository, built.headSha, verdict);
  }
}
