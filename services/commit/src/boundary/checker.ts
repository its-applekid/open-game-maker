import type { GitHubApp } from '../types.js';
import type { BoundaryApi } from './api-client.js';
import type { BlocklistLoader } from './blocklist.js';
import { BoundaryCheckPoster } from './check-run.js';
import { evaluateDiff } from './evaluate.js';
import { buildDiffInput, pullChangedFiles } from './inputs.js';
import type { BoundaryCheckRequest } from './poller.js';

export type PullFile = { filename: string; status: string; sha: string };

// The one game whose folder every changed file sits in. A pull request that spans folders belongs to no game.
export function gameForChangedFiles(
  changed: { filename: string }[],
  games: { gameId: string; path: string }[],
): { gameId: string; path: string } | null {
  const owners = games.filter((game) =>
    changed.every((file) => file.filename === game.path || file.filename.startsWith(`${game.path}/`)),
  );
  return owners.length === 1 ? (owners[0] ?? null) : null;
}

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
    const changed = await pullChangedFiles(github.request, request.repository, request.pull.number);
    const game = gameForChangedFiles(changed, request.games);
    if (game === null) {
      // Every game lives in its own folder of the instance repository; a change spanning folders is refused here.
      await this.#poster.post(github.request, request.repository, request.pull.headSha, {
        allowed: false,
        reasons: [
          {
            code: 'path',
            detail: 'a pull request may only change one game folder',
          },
        ],
      });
      return;
    }
    const [blocklist, profileNames] = await Promise.all([this.#blocklist.load(), this.#api.piiTerms(game.gameId)]);
    const built = await buildDiffInput({
      request: github.request,
      repository: request.repository,
      prNumber: request.pull.number,
      pull: request.pull,
      changed,
      blocklist,
      profileNames,
      gamePath: game.path,
    });
    const verdict = evaluateDiff(built.input);
    await this.#poster.post(github.request, request.repository, built.headSha, verdict);
  }
}
