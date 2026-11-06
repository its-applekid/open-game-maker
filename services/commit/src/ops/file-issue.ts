import type { CommitResult } from '../types.js';
import { refused } from '../result.js';
import type { OperationContext } from './context.js';
import type { ExtractCommitOp } from './operation-types.js';

const PLATFORM_LABELS = ['bug', 'source:report'];

// A game's issue carries its own label, so intake can tell whose work it is in the shared instance repository.
export function gameIssueLabel(slug: string): string {
  return `game:${slug}`;
}

/*
 * Platform bugs go to the configured platform repository; a report about one game lands in the instance repository
 * with that game's label. Either way the issue never carries a dispatch label: user text must not drive a daemon with
 * platform write access.
 */
export async function fileIssue(op: ExtractCommitOp<'file_issue'>, context: OperationContext): Promise<CommitResult> {
  if (op.labels.some((label) => !PLATFORM_LABELS.includes(label))) {
    return refused('denylist', 'platform issue labels are not allowed');
  }

  const gameId = op.gameId;
  const repository = gameId === undefined ? null : await context.repos.resolve(gameId);
  const target = repository ?? context.platformIssueRepo;
  const labels = repository === null ? op.labels : [...new Set([...op.labels, gameIssueLabel(repository.slug)])];
  const github = await context.app.forOwner(target.owner);
  const response = await github.request<{ number: number }>('POST /repos/{owner}/{repo}/issues', {
    owner: target.owner,
    repo: target.name,
    title: op.title,
    body: op.body,
    labels,
  });
  return { ok: true, sha: `issue:${response.data.number}` };
}
