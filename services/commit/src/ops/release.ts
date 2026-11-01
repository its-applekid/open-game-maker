import type { CommitResult } from '../types.js';
import { GitHubRequestError } from '../github-request.js';
import { refused } from '../result.js';
import type { OperationContext } from './context.js';
import type { ExtractCommitOp } from './operation-types.js';

export async function release(
  op: ExtractCommitOp<'release'>,
  context: OperationContext,
): Promise<CommitResult> {
  const repository = await context.repos.resolve(op.gameId);
  const verdict = await context.gate.evaluate({
    kind: op.kind,
    repository,
    sha: op.sha,
  });
  if (!verdict.allowed) return { ok: false, verdict };

  const github = await context.app.forOwner(repository.owner);
  const identity = await context.app.identity();
  const tag = `gm/${op.gameId}/v${op.semver}`;
  const created = await github.request<{ sha: string }>('POST /repos/{owner}/{repo}/git/tags', {
    ...repository,
    tag,
    message: op.changelog,
    object: op.sha,
    type: 'commit',
    tagger: identity,
  });
  try {
    await github.request('POST /repos/{owner}/{repo}/git/refs', {
      ...repository,
      ref: `refs/tags/${tag}`,
      sha: created.data.sha,
    });
  } catch (error) {
    if (error instanceof GitHubRequestError && error.status === 422) {
      return refused('denylist', 'tag exists');
    }
    throw error;
  }
  return { ok: true, sha: created.data.sha };
}
