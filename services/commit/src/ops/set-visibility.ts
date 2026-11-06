import type { CommitResult } from '../types.js';
import type { OperationContext } from './context.js';
import type { ExtractCommitOp } from './operation-types.js';

/*
 * A game's visibility no longer flips a repository. Every game shares the instance repository, whose visibility the
 * operator sets at setup, so this operation keeps only its gate: making a game's content public still has to pass the
 * boundary checks before the API records the change.
 */
export async function setVisibility(
  op: ExtractCommitOp<'set_visibility'>,
  context: OperationContext,
): Promise<CommitResult> {
  const repository = await context.repos.resolve(op.gameId);
  const verdict = await context.gate.evaluate({
    kind: op.kind,
    gameId: op.gameId,
    repository,
    targetVisibility: op.visibility,
    gamePath: repository.path,
  });
  if (!verdict.allowed) return { ok: false, verdict };
  return { ok: true, sha: op.visibility };
}
