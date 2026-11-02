import type { GitHubApp, Repository } from '../types.js';
import type { ActiveRepository, BoundaryApi } from './api-client.js';
import type { PullSnapshot } from './inputs.js';

export type BoundaryCheckRequest = {
  gameId: string;
  repository: Repository;
  pull: PullSnapshot;
};

export type BoundaryCheck = (request: BoundaryCheckRequest) => Promise<void>;
type Log = (line: Record<string, unknown>) => void;
type Pull = { number: number; draft: boolean; head: { sha: string } };

async function openPulls(app: GitHubApp, repository: Repository): Promise<Pull[]> {
  const github = await app.forOwner(repository.owner);
  const pulls: Pull[] = [];
  for (let page = 1; ; page += 1) {
    const response = await github.request<Pull[]>('GET /repos/{owner}/{repo}/pulls', {
      ...repository,
      state: 'open',
      per_page: 100,
      page,
    });
    pulls.push(...response.data);
    if (response.data.length < 100) return pulls;
  }
}

function repositoryOf(active: ActiveRepository): Repository {
  return { owner: active.owner, name: active.name, visibility: active.visibility };
}

export async function runBoundaryPoll(options: {
  api: Pick<BoundaryApi, 'activeRepositories'>;
  app: GitHubApp;
  check: BoundaryCheck;
  log: Log;
}): Promise<void> {
  const repositories = await options.api.activeRepositories();
  for (const active of repositories) {
    const repository = repositoryOf(active);
    try {
      for (const pull of await openPulls(options.app, repository)) {
        await options.check({
          gameId: active.gameId,
          repository,
          pull: { number: pull.number, draft: pull.draft, headSha: pull.head.sha },
        });
      }
    } catch (error) {
      options.log({
        event: 'boundary-poll-error',
        repo: `${repository.owner}/${repository.name}`,
        error: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }
}

export function startBoundaryPoller(options: {
  api: Pick<BoundaryApi, 'activeRepositories'>;
  app: GitHubApp;
  check: BoundaryCheck;
  log: Log;
  intervalMs?: number;
}): { stop(): void } {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runBoundaryPoll(options);
    } catch (error) {
      options.log({
        event: 'boundary-poll-error',
        error: error instanceof Error ? error.name : 'UnknownError',
      });
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), options.intervalMs ?? 60_000);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
