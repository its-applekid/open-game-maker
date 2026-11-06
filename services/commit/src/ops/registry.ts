import { GitHubRateLimitError } from '../github-request.js';
import { refused } from '../result.js';
import type { CommitOp, CommitResult } from '../types.js';
import type { OperationContext } from './context.js';
import { createBranch } from './create-branch.js';
import { createGame } from './create-game.js';
import { fileIssue } from './file-issue.js';
import { foldDesign } from './fold-design.js';
import { merge } from './merge.js';
import { release } from './release.js';
import { restoreGame } from './restore-game.js';
import { setVisibility } from './set-visibility.js';

export async function executeOperation(op: CommitOp, context: OperationContext): Promise<CommitResult> {
  try {
    switch (op.kind) {
      case 'create_game':
        return await createGame(op, context);
      case 'fold_design':
        return await foldDesign(op, context);
      case 'release':
        return await release(op, context);
      case 'restore_game':
        return await restoreGame(op, context);
      case 'merge':
        return await merge(op, context);
      case 'set_visibility':
        return await setVisibility(op, context);
      case 'create_branch':
        return await createBranch(op, context);
      case 'file_issue':
        return await fileIssue(op, context);
    }
  } catch (error) {
    if (error instanceof GitHubRateLimitError) {
      return refused('denylist', 'github rate limited');
    }
    throw error;
  }
}
