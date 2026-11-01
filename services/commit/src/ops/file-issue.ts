import type { CommitResult } from '../types.js';
import { refused } from '../result.js';
import type { OperationContext } from './context.js';
import type { ExtractCommitOp } from './operation-types.js';

export async function fileIssue(
  op: ExtractCommitOp<'file_issue'>,
  context: OperationContext,
): Promise<CommitResult> {
  if (op.labels.some((label) => label !== 'bug' && label !== 'source:report')) {
    return refused('denylist', 'platform issue labels are not allowed');
  }
  const { owner, name: repo } = context.platformIssueRepo;
  const github = await context.app.forOwner(owner);
  const response = await github.request<{ number: number }>('POST /repos/{owner}/{repo}/issues', {
    owner,
    repo,
    title: op.title,
    body: op.body,
    labels: op.labels,
  });
  return { ok: true, sha: `issue:${response.data.number}` };
}
