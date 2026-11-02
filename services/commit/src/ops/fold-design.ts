import { GitHubRequestError } from '../github-request.js';
import { normalizeCommitPath } from '../paths.js';
import { refused } from '../result.js';
import type { CommitResult, GitHubRequest, Repository } from '../types.js';
import type { OperationContext } from './context.js';
import { createCommit, createTreeFromFiles } from './git-data.js';
import type { ExtractCommitOp } from './operation-types.js';

type CommitData = { tree: { sha: string } };

function isNonFastForward(error: unknown): boolean {
  return (
    error instanceof GitHubRequestError &&
    error.status === 422 &&
    /fast.?forward|reference update failed/iu.test(error.message)
  );
}

async function latestHead(request: GitHubRequest, repo: Repository): Promise<string> {
  const response = await request<{ object: { sha: string } }>('GET /repos/{owner}/{repo}/git/ref/{ref}', {
    ...repo,
    ref: 'heads/main',
  });
  return response.data.object.sha;
}

export async function foldDesign(op: ExtractCommitOp<'fold_design'>, context: OperationContext): Promise<CommitResult> {
  for (const file of op.files) {
    try {
      normalizeCommitPath(file.path);
    } catch {
      return refused('path', 'unsafe repository path', file.path);
    }
  }

  const repository = await context.repos.resolve(op.gameId);
  const verdict = await context.gate.evaluate({
    kind: op.kind,
    gameId: op.gameId,
    repository,
    files: op.files.map((file) => ({
      path: file.path,
      bytes: Buffer.byteLength(file.content),
      content: file.content,
    })),
    sha: op.base,
  });
  if (!verdict.allowed) return { ok: false, verdict };

  const github = await context.app.forOwner(repository.owner);
  const identity = await context.app.identity();
  let base = op.base;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const parent = await github.request<CommitData>('GET /repos/{owner}/{repo}/git/commits/{commit_sha}', {
        ...repository,
        commit_sha: base,
      });
      const tree = await createTreeFromFiles(github.request, repository, op.files, parent.data.tree.sha);
      const sha = await createCommit(github.request, repository, `design: fold ${op.gameId}`, tree, identity, [base]);
      await github.request('PATCH /repos/{owner}/{repo}/git/refs/{ref}', {
        ...repository,
        ref: 'heads/main',
        sha,
        force: false,
      });
      return { ok: true, sha };
    } catch (error) {
      if (!isNonFastForward(error)) throw error;
      if (attempt === 2) return refused('denylist', 'main moved during design fold');
      base = await latestHead(github.request, repository);
    }
  }
  return refused('denylist', 'main moved during design fold');
}
