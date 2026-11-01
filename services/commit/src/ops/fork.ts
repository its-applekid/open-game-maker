import { GitHubRequestError } from '../github-request.js';
import { repositoryName } from '../paths.js';
import { refused } from '../result.js';
import type { CommitResult, GitHubRequest, Repository } from '../types.js';
import type { OperationContext } from './context.js';
import { createCommit } from './git-data.js';
import type { ExtractCommitOp } from './operation-types.js';
import { ensurePrivateRepository } from './repository.js';

type TreeItem = {
  path?: string;
  mode?: string;
  type?: 'blob' | 'commit' | 'tree';
  sha?: string;
};

function excluded(path: string): boolean {
  return path === '.gm' || path.startsWith('.gm/') || path === 'saves' || path.startsWith('saves/');
}

async function mapConcurrent<T, U>(items: T[], limit: number, transform: (item: T) => Promise<U>): Promise<U[]> {
  const output = new Array<U>(items.length);
  let next = 0;
  async function work(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item !== undefined) output[index] = await transform(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, work));
  return output;
}

async function completedForkSha(
  request: GitHubRequest,
  destination: Repository,
  trailer: string,
): Promise<string | null | undefined> {
  let sha: string;
  try {
    const ref = await request<{ object: { sha: string } }>('GET /repos/{owner}/{repo}/git/ref/{ref}', {
      ...destination,
      ref: 'heads/main',
    });
    sha = ref.data.object.sha;
  } catch (error) {
    if (error instanceof GitHubRequestError && error.status === 404) return undefined;
    throw error;
  }
  const commit = await request<{ message: string }>('GET /repos/{owner}/{repo}/git/commits/{commit_sha}', {
    ...destination,
    commit_sha: sha,
  });
  return commit.data.message.endsWith(`\n\n${trailer}`) ? sha : null;
}

async function finishFork(
  op: ExtractCommitOp<'fork'>,
  request: GitHubRequest,
  destination: Repository,
  sha: string,
): Promise<CommitResult> {
  if (op.visibility === 'public') {
    await request('PATCH /repos/{owner}/{repo}', {
      ...destination,
      private: false,
    });
  }
  return { ok: true, sha };
}

export async function fork(op: ExtractCommitOp<'fork'>, context: OperationContext): Promise<CommitResult> {
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

  const destinationGitHub = await context.app.forOwner(op.owner);
  const repositoryState = await ensurePrivateRepository(destinationGitHub, op.owner, name);
  const trailer = `Forked-From: ${op.sourceGameId}@${op.sourceSha}`;
  if (repositoryState === 'existing') {
    const existingSha = await completedForkSha(destinationGitHub.request, destination, trailer);
    if (existingSha === null) return refused('denylist', 'fork destination already contains another main branch');
    if (existingSha !== undefined) return finishFork(op, destinationGitHub.request, destination, existingSha);
  }

  const blobs = files.filter((item) => item.type === 'blob');
  const tree = await mapConcurrent(blobs, 8, async (item) => {
    const blob = await sourceGitHub.request<{ content: string; encoding: string }>(
      'GET /repos/{owner}/{repo}/git/blobs/{file_sha}',
      { ...source, file_sha: item.sha },
    );
    const created = await destinationGitHub.request<{ sha: string }>('POST /repos/{owner}/{repo}/git/blobs', {
      ...destination,
      content: blob.data.content,
      encoding: blob.data.encoding,
    });
    return { path: item.path, mode: item.mode, type: 'blob' as const, sha: created.data.sha };
  });
  const createdTree = await destinationGitHub.request<{ sha: string }>('POST /repos/{owner}/{repo}/git/trees', {
    ...destination,
    tree,
  });
  const sha = await createCommit(
    destinationGitHub.request,
    destination,
    `fork: ${op.sourceGameId}\n\n${trailer}`,
    createdTree.data.sha,
    await context.app.identity(),
  );
  await destinationGitHub.request('POST /repos/{owner}/{repo}/git/refs', {
    ...destination,
    ref: 'refs/heads/main',
    sha,
  });
  return finishFork(op, destinationGitHub.request, destination, sha);
}
