import { refused } from '../result.js';
import { repositoryName } from '../paths.js';
import type { CommitResult, Repository } from '../types.js';
import type { OperationContext } from './context.js';
import { createCommit } from './git-data.js';
import type { ExtractCommitOp } from './operation-types.js';

type TreeItem = {
  path?: string;
  mode?: string;
  type?: 'blob' | 'commit' | 'tree';
  sha?: string;
};

function excluded(path: string): boolean {
  return path === '.gm' || path.startsWith('.gm/') || path === 'saves' || path.startsWith('saves/');
}

export async function fork(
  op: ExtractCommitOp<'fork'>,
  context: OperationContext,
): Promise<CommitResult> {
  const source = await context.repos.resolve(op.sourceGameId);
  const sourceGitHub = await context.app.forOwner(source.owner);
  const sourceCommit = await sourceGitHub.request<{ tree: { sha: string } }>(
    'GET /repos/{owner}/{repo}/git/commits/{commit_sha}',
    { ...source, commit_sha: op.sourceSha },
  );
  const sourceTree = await sourceGitHub.request<{ tree: TreeItem[]; truncated: boolean }>(
    'GET /repos/{owner}/{repo}/git/trees/{tree_sha}',
    { ...source, tree_sha: sourceCommit.data.tree.sha, recursive: '1' },
  );
  if (sourceTree.data.truncated) return refused('size', 'source tree is too large to fork');

  const files = sourceTree.data.tree.filter(
    (item): item is Required<Pick<TreeItem, 'path' | 'mode' | 'type' | 'sha'>> =>
      item.path !== undefined &&
      item.mode !== undefined &&
      item.type !== undefined &&
      item.sha !== undefined &&
      !excluded(item.path),
  );
  if (files.some((item) => item.mode === '120000' || item.type === 'commit')) {
    return refused('path', 'fork source contains a symlink or submodule');
  }

  const name = repositoryName(op.newGameId);
  const destination: Repository = { owner: op.owner, name, visibility: 'private' };
  if (op.visibility === 'public') {
    const verdict = await context.gate.evaluate({
      kind: 'set_visibility',
      repository: destination,
      targetVisibility: 'public',
    });
    if (!verdict.allowed) return { ok: false, verdict };
  }
  const destinationGitHub = await context.app.forOwner(op.owner);
  const route =
    destinationGitHub.accountType === 'Organization' ? 'POST /orgs/{org}/repos' : 'POST /user/repos';
  await destinationGitHub.request(route, {
    ...(destinationGitHub.accountType === 'Organization' ? { org: op.owner } : {}),
    name,
    private: true,
    auto_init: false,
    has_issues: true,
  });

  const tree: { path: string; mode: string; type: 'blob'; sha: string }[] = [];
  for (const item of files) {
    if (item.type !== 'blob') continue;
    const blob = await sourceGitHub.request<{ content: string; encoding: string }>(
      'GET /repos/{owner}/{repo}/git/blobs/{file_sha}',
      { ...source, file_sha: item.sha },
    );
    const created = await destinationGitHub.request<{ sha: string }>(
      'POST /repos/{owner}/{repo}/git/blobs',
      { ...destination, content: blob.data.content, encoding: blob.data.encoding },
    );
    tree.push({ path: item.path, mode: item.mode, type: 'blob', sha: created.data.sha });
  }
  const createdTree = await destinationGitHub.request<{ sha: string }>(
    'POST /repos/{owner}/{repo}/git/trees',
    { ...destination, tree },
  );
  const sha = await createCommit(
    destinationGitHub.request,
    destination,
    `fork: ${op.sourceGameId}\n\nForked-From: ${op.sourceGameId}@${op.sourceSha}`,
    createdTree.data.sha,
    await context.app.identity(),
  );
  await destinationGitHub.request('POST /repos/{owner}/{repo}/git/refs', {
    ...destination,
    ref: 'refs/heads/main',
    sha,
  });
  if (op.visibility === 'public') {
    await destinationGitHub.request('PATCH /repos/{owner}/{repo}', {
      ...destination,
      private: false,
    });
  }
  return { ok: true, sha };
}
