import type { AuthenticatedGitHub, CommitResult, Repository } from '../types.js';
import { GitHubRequestError } from '../github-request.js';
import { refused } from '../result.js';
import type { OperationContext } from './context.js';
import type { ExtractCommitOp } from './operation-types.js';

export async function release(op: ExtractCommitOp<'release'>, context: OperationContext): Promise<CommitResult> {
  const repository = await context.repos.resolve(op.gameId);
  const verdict = await context.gate.evaluate({
    kind: op.kind,
    gameId: op.gameId,
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
      const existing = await existingTagSha(github.request, repository, tag, op.sha);
      return existing ? { ok: true, sha: existing } : refused('denylist', 'tag exists');
    }
    throw error;
  }
  return { ok: true, sha: created.data.sha };
}

/* A retried release whose earlier response was lost finds its own tag: same name, same commit. */
async function existingTagSha(
  request: AuthenticatedGitHub['request'],
  repository: Repository,
  tag: string,
  commitSha: string,
): Promise<string | null> {
  const ref = await request<{ object: { sha: string; type: string } }>('GET /repos/{owner}/{repo}/git/ref/{ref}', {
    ...repository,
    ref: `tags/${tag}`,
  });
  if (ref.data.object.type !== 'tag') return null;
  const object = await request<{ object: { sha: string } }>('GET /repos/{owner}/{repo}/git/tags/{tag_sha}', {
    ...repository,
    tag_sha: ref.data.object.sha,
  });
  return object.data.object.sha === commitSha ? ref.data.object.sha : null;
}
