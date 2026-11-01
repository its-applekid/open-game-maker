import { CommitResult, type BoundaryVerdict } from '@ogm/contracts';

import type { Fleet } from './fleet/fleet.js';
import type { JobKind } from './fleet/types.js';

export type ProvisionInput = {
  gameId: string;
  owner: string;
  visibility: 'public' | 'private';
  kind: JobKind;
  // `game-<2d|3d|multiplayer>@1`, rendered by `@ogm/game-repo-template` inside the commit service.
  templateRef: string;
};

export type ProvisionDeps = {
  commit: { url: string; token: string };
  fleet: Pick<Fleet, 'prepareDaemonDir'>;
  // Records `games.repo` on the API's game row (OGM-012).
  setGameRepo: (gameId: string, repo: string) => Promise<void>;
  fetch?: typeof fetch;
};

export type ProvisionResult = { ok: true; repo: string; sha: string } | { ok: false; verdict: BoundaryVerdict };

// Creates the game repo through the commit service, renders its daemon directory (the unit starts on the first job,
// OGM-031), then records the repo on the game row. A refused `create_repo` comes back unchanged.
export async function provisionGameRepo(input: ProvisionInput, deps: ProvisionDeps): Promise<ProvisionResult> {
  const doFetch = deps.fetch ?? fetch;
  const response = await doFetch(new URL('/internal/commit', deps.commit.url), {
    method: 'POST',
    headers: { authorization: `Bearer ${deps.commit.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'create_repo',
      gameId: input.gameId,
      owner: input.owner,
      visibility: input.visibility,
      templateRef: input.templateRef,
    }),
  });
  if (!response.ok) throw new Error(`commit service create_repo failed with ${response.status}`);
  const result = CommitResult.parse(await response.json());
  if (!result.ok) return result;

  const repo = `${input.owner}/gm-${input.gameId}`;
  await deps.fleet.prepareDaemonDir(repo, input.kind);
  await deps.setGameRepo(input.gameId, repo);
  return { ok: true, repo, sha: result.sha };
}
