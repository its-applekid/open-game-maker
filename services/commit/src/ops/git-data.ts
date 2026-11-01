import { normalizeCommitPath } from '../paths.js';
import type { GitHubIdentity, GitHubRequest } from '../types.js';

// `120000` is a symlink whose content is its target; `100755` an executable.
export type ContentFile = { path: string; content: string; mode?: '100644' | '100755' | '120000' };

export async function createTreeFromFiles(
  request: GitHubRequest,
  repo: { owner: string; name: string },
  files: ContentFile[],
  baseTree?: string,
): Promise<string> {
  const tree: { path: string; mode: NonNullable<ContentFile['mode']>; type: 'blob'; sha: string }[] = [];
  for (const file of files) {
    const path = normalizeCommitPath(file.path);
    const blob = await request<{ sha: string }>('POST /repos/{owner}/{repo}/git/blobs', {
      ...repo,
      content: Buffer.from(file.content, 'utf8').toString('base64'),
      encoding: 'base64',
    });
    tree.push({ path, mode: file.mode ?? '100644', type: 'blob', sha: blob.data.sha });
  }
  const response = await request<{ sha: string }>('POST /repos/{owner}/{repo}/git/trees', {
    ...repo,
    ...(baseTree === undefined ? {} : { base_tree: baseTree }),
    tree,
  });
  return response.data.sha;
}

export async function createCommit(
  request: GitHubRequest,
  repo: { owner: string; name: string },
  message: string,
  tree: string,
  identity: GitHubIdentity,
  parents: string[] = [],
): Promise<string> {
  const response = await request<{ sha: string }>('POST /repos/{owner}/{repo}/git/commits', {
    ...repo,
    message,
    tree,
    parents,
    author: identity,
    committer: identity,
  });
  return response.data.sha;
}
