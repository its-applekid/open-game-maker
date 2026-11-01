import type { CommitResult } from '../types.js';
import type { OperationContext } from './context.js';
import type { ExtractCommitOp } from './operation-types.js';

export async function setVisibility(
  op: ExtractCommitOp<'set_visibility'>,
  context: OperationContext,
): Promise<CommitResult> {
  const repository = await context.repos.resolve(op.gameId);
  const verdict = await context.gate.evaluate({
    kind: op.kind,
    repository,
    targetVisibility: op.visibility,
  });
  if (!verdict.allowed) return { ok: false, verdict };

  const github = await context.app.forOwner(repository.owner);
  await github.request('PATCH /repos/{owner}/{repo}', {
    ...repository,
    private: op.visibility === 'private',
  });
  return { ok: true, sha: op.visibility };
}
