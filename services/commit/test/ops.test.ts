import { describe, expect, it, vi } from 'vitest';

import { GitHubRequestError } from '../src/github-request.js';
import { createBranch } from '../src/ops/create-branch.js';
import { createRepo } from '../src/ops/create-repo.js';
import { fileIssue } from '../src/ops/file-issue.js';
import { foldDesign } from '../src/ops/fold-design.js';
import { fork, MAX_FORK_BYTES, MAX_FORK_FILES } from '../src/ops/fork.js';
import { merge } from '../src/ops/merge.js';
import { release } from '../src/ops/release.js';
import { setVisibility } from '../src/ops/set-visibility.js';
import { allowed } from '../src/result.js';
import { fakeRequest, contextWith } from './helpers.js';

describe('commit operations', () => {
  it('creates a private repository before its initial commit and controls', async () => {
    const { request, calls } = fakeRequest((call) => {
      if (call.route.includes('/git/trees')) return { sha: 'tree-1' };
      if (call.route.includes('/git/commits')) return { sha: 'commit-1' };
      return {};
    });
    const context = contextWith(request, {
      templates: {
        async render() {
          return {
            files: [],
            labels: [{ name: 'flake', color: 'fbca04' }],
            requiredChecks: ['ci / required', 'ogm/boundary'],
          };
        },
      },
    });
    await expect(
      createRepo(
        { kind: 'create_repo', gameId: 'game-1', owner: 'alice', visibility: 'private', templateRef: 'default' },
        context,
      ),
    ).resolves.toEqual({ ok: true, sha: 'commit-1' });
    expect(calls.map((call) => call.route)).toEqual([
      'POST /user/repos',
      'POST /repos/{owner}/{repo}/git/trees',
      'POST /repos/{owner}/{repo}/git/commits',
      'POST /repos/{owner}/{repo}/git/refs',
      'POST /repos/{owner}/{repo}/labels',
      'POST /repos/{owner}/{repo}/rulesets',
      'PUT /repos/{owner}/{repo}/collaborators/{username}',
    ]);
    expect(calls[0]?.parameters).toMatchObject({ name: 'gm-game-1', private: true });
  });

  it('re-reads main and retries a non-fast-forward fold', async () => {
    let refUpdates = 0;
    const { request, calls } = fakeRequest((call) => {
      if (call.route.endsWith('/git/commits/{commit_sha}')) return { tree: { sha: 'base-tree' } };
      if (call.route.endsWith('/git/blobs')) return { sha: 'blob-1' };
      if (call.route.endsWith('/git/trees')) return { sha: 'tree-1' };
      if (call.route.endsWith('/git/commits')) return { sha: `commit-${refUpdates + 1}` };
      if (call.route.endsWith('/git/refs/{ref}')) {
        refUpdates += 1;
        if (refUpdates === 1) throw new GitHubRequestError('Reference update failed', 422);
        return {};
      }
      if (call.route.endsWith('/git/ref/{ref}')) return { object: { sha: 'new-base' } };
      throw new Error(`unexpected route ${call.route}`);
    });
    const evaluate = vi.fn(async () => allowed());
    const result = await foldDesign(
      {
        kind: 'fold_design',
        gameId: 'game-1',
        base: 'old-base',
        files: [{ path: 'design/entities.json', content: '{}' }],
      },
      contextWith(request, { gate: { evaluate } }),
    );
    expect(result).toEqual({ ok: true, sha: 'commit-2' });
    expect(refUpdates).toBe(2);
    expect(calls.filter((call) => call.route.endsWith('/git/ref/{ref}'))).toHaveLength(1);
    expect(calls.at(-1)?.parameters).toMatchObject({ force: false });
    expect(evaluate).toHaveBeenNthCalledWith(1, {
      kind: 'fold_design',
      gameId: 'game-1',
      repository: { owner: 'alice', name: 'gm-game-1', visibility: 'private' },
      sha: 'old-base',
      files: [{ path: 'design/entities.json', content: '{}' }],
    });
    expect(evaluate).toHaveBeenNthCalledWith(2, expect.objectContaining({ sha: 'new-base' }));
  });

  it('gives up after three concurrent fold updates', async () => {
    const { request, calls } = fakeRequest((call) => {
      if (call.route.endsWith('/git/commits/{commit_sha}')) return { tree: { sha: 'base-tree' } };
      if (call.route.endsWith('/git/blobs')) return { sha: 'blob' };
      if (call.route.endsWith('/git/trees')) return { sha: 'tree' };
      if (call.route.endsWith('/git/commits')) return { sha: 'commit' };
      if (call.route.endsWith('/git/refs/{ref}')) {
        throw new GitHubRequestError('not a fast-forward', 422);
      }
      if (call.route.endsWith('/git/ref/{ref}')) return { object: { sha: 'new-base' } };
      throw new Error(`unexpected route ${call.route}`);
    });
    await expect(
      foldDesign({ kind: 'fold_design', gameId: 'game-1', base: 'base', files: [] }, contextWith(request)),
    ).resolves.toMatchObject({ ok: false, verdict: { reasons: [{ code: 'denylist' }] } });
    expect(calls.filter((call) => call.route.endsWith('/git/refs/{ref}'))).toHaveLength(3);
  });

  it('rejects an unsafe design path before making GitHub calls', async () => {
    const { request, calls } = fakeRequest(() => ({}));
    await expect(
      foldDesign(
        { kind: 'fold_design', gameId: 'game-1', base: 'base', files: [{ path: '../x', content: '' }] },
        contextWith(request),
      ),
    ).resolves.toMatchObject({ ok: false, verdict: { reasons: [{ code: 'path', path: '../x' }] } });
    expect(calls).toHaveLength(0);
  });

  it('pins a squash merge to the observed pull request head', async () => {
    const { request, calls } = fakeRequest((call) =>
      call.route.startsWith('GET')
        ? { head: { sha: 'head-123' }, title: 'Add level' }
        : { merged: true, message: 'ok', sha: 'merge-456' },
    );
    await expect(merge({ kind: 'merge', gameId: 'game-1', prNumber: 7 }, contextWith(request))).resolves.toEqual({
      ok: true,
      sha: 'merge-456',
    });
    expect(calls[1]?.parameters).toMatchObject({ sha: 'head-123', merge_method: 'squash' });
  });

  it('creates an annotated release tag', async () => {
    const { request, calls } = fakeRequest((call) => (call.route.endsWith('/git/tags') ? { sha: 'tag-object' } : {}));
    await expect(
      release(
        { kind: 'release', gameId: 'game-1', sha: 'commit-1', semver: '1.2.3', changelog: 'New level' },
        contextWith(request),
      ),
    ).resolves.toEqual({ ok: true, sha: 'tag-object' });
    expect(calls[0]?.parameters).toMatchObject({ tag: 'gm/game-1/v1.2.3', object: 'commit-1' });
    expect(calls[1]?.parameters).toMatchObject({ ref: 'refs/tags/gm/game-1/v1.2.3', sha: 'tag-object' });
  });

  it('does not write a visibility change refused by the gate', async () => {
    const { request, calls } = fakeRequest(() => ({}));
    const context = contextWith(request, {
      gate: {
        async evaluate() {
          return { allowed: false, reasons: [{ code: 'denylist', detail: 'blocked' }] };
        },
      },
    });
    await expect(
      setVisibility({ kind: 'set_visibility', gameId: 'game-1', visibility: 'public' }, context),
    ).resolves.toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
  });

  it('creates a validated branch ref', async () => {
    const { request, calls } = fakeRequest(() => ({}));
    await expect(
      createBranch(
        { kind: 'create_branch', gameId: 'game-1', branch: 'feature/level-2', sha: 'commit-1' },
        contextWith(request),
      ),
    ).resolves.toEqual({ ok: true, sha: 'commit-1' });
    expect(calls[0]?.parameters).toMatchObject({ ref: 'refs/heads/feature/level-2', sha: 'commit-1' });
  });

  it('files issues only in the configured platform repository', async () => {
    const { request, calls } = fakeRequest(() => ({ number: 42 }));
    await expect(
      fileIssue(
        {
          kind: 'file_issue',
          title: 'Builder crashed',
          body: 'Reproduction steps',
          labels: ['bug', 'source:report'],
        },
        contextWith(request),
      ),
    ).resolves.toEqual({ ok: true, sha: 'issue:42' });
    expect(calls[0]?.parameters).toMatchObject({
      owner: 'platform',
      repo: 'bugs',
      title: 'Builder crashed',
      labels: ['bug', 'source:report'],
    });
  });

  it('refuses dispatch labels on platform issues', async () => {
    const { request, calls } = fakeRequest(() => ({ number: 42 }));
    await expect(
      fileIssue(
        {
          kind: 'file_issue',
          title: 'Builder crashed',
          body: 'Reproduction steps',
          labels: ['agent:todo'],
        },
        contextWith(request),
      ),
    ).resolves.toMatchObject({ ok: false, verdict: { reasons: [{ code: 'denylist' }] } });
    expect(calls).toHaveLength(0);
  });

  it('forks regular blobs while excluding private game state', async () => {
    const { request, calls } = fakeRequest((call) => {
      if (call.route.endsWith('/git/commits/{commit_sha}')) return { tree: { sha: 'source-tree' } };
      if (call.route.endsWith('/git/trees/{tree_sha}')) {
        return {
          truncated: false,
          tree: [
            { path: 'src/game.ts', mode: '100644', type: 'blob', sha: 'source-blob', size: 7 },
            { path: '.gm/context.json', mode: '100644', type: 'blob', sha: 'private-blob' },
            { path: 'saves/slot-1.json', mode: '100644', type: 'blob', sha: 'save-blob' },
          ],
        };
      }
      if (call.route.endsWith('/git/blobs/{file_sha}')) return { content: 'Y29udGVudA==', encoding: 'base64' };
      if (call.route.endsWith('/git/blobs')) return { sha: 'copied-blob' };
      if (call.route.endsWith('/git/trees')) return { sha: 'fork-tree' };
      if (call.route.endsWith('/git/commits')) return { sha: 'fork-commit' };
      return {};
    });
    await expect(
      fork(
        {
          kind: 'fork',
          sourceGameId: 'game-1',
          sourceSha: 'source-commit',
          newGameId: 'game-2',
          owner: 'alice',
          visibility: 'private',
        },
        contextWith(request),
      ),
    ).resolves.toEqual({ ok: true, sha: 'fork-commit' });
    expect(calls.filter((call) => call.route.endsWith('/git/blobs/{file_sha}'))).toHaveLength(1);
    expect(calls.find((call) => call.route.endsWith('/git/trees/{tree_sha}'))?.parameters).toMatchObject({
      tree_sha: 'source-tree',
    });
    expect(calls.find((call) => call.route.endsWith('/git/trees'))?.parameters).toMatchObject({
      tree: [{ path: 'src/game.ts', mode: '100644', type: 'blob', sha: 'copied-blob' }],
    });
  });

  it('resumes a partial fork in the same destination repository', async () => {
    let repositoryCreated = false;
    let refAttempts = 0;
    const { request, calls } = fakeRequest((call) => {
      if (call.route === 'POST /user/repos') {
        if (repositoryCreated) throw new GitHubRequestError('already exists', 422);
        repositoryCreated = true;
        return {};
      }
      if (call.route === 'GET /repos/{owner}/{repo}') return { name: 'gm-game-2' };
      if (call.route.endsWith('/git/ref/{ref}')) throw new GitHubRequestError('not found', 404);
      if (call.route.endsWith('/git/commits/{commit_sha}')) return { tree: { sha: 'source-tree' } };
      if (call.route.endsWith('/git/trees/{tree_sha}')) return { truncated: false, tree: [] };
      if (call.route.endsWith('/git/trees')) return { sha: 'fork-tree' };
      if (call.route.endsWith('/git/commits')) return { sha: 'fork-commit' };
      if (call.route.endsWith('/git/refs')) {
        refAttempts += 1;
        if (refAttempts === 1) throw new GitHubRequestError('connection lost', 500);
        return {};
      }
      return {};
    });
    const operation = {
      kind: 'fork' as const,
      sourceGameId: 'game-1',
      sourceSha: 'source-commit',
      newGameId: 'game-2',
      owner: 'alice',
      visibility: 'private' as const,
    };
    const context = contextWith(request);

    await expect(fork(operation, context)).rejects.toThrow('connection lost');
    await expect(fork(operation, context)).resolves.toEqual({ ok: true, sha: 'fork-commit' });
    expect(calls.filter((call) => call.route === 'POST /user/repos')).toHaveLength(2);
    expect(calls.filter((call) => call.route === 'GET /repos/{owner}/{repo}')).toHaveLength(1);
    expect(refAttempts).toBe(2);
  });

  it('finishes public visibility after a completed fork is retried', async () => {
    let repositoryCreated = false;
    let refWritten = false;
    let visibilityAttempts = 0;
    const { request, calls } = fakeRequest((call) => {
      if (call.route === 'POST /user/repos') {
        if (repositoryCreated) throw new GitHubRequestError('already exists', 422);
        repositoryCreated = true;
        return {};
      }
      if (call.route === 'GET /repos/{owner}/{repo}') return { name: 'gm-game-2' };
      if (call.route.endsWith('/git/ref/{ref}')) {
        if (!refWritten) throw new GitHubRequestError('not found', 404);
        return { object: { sha: 'fork-commit' } };
      }
      if (call.route.endsWith('/git/commits/{commit_sha}')) {
        return call.parameters.commit_sha === 'fork-commit'
          ? { message: 'fork: game-1\n\nForked-From: game-1@source-commit' }
          : { tree: { sha: 'source-tree' } };
      }
      if (call.route.endsWith('/git/trees/{tree_sha}')) return { truncated: false, tree: [] };
      if (call.route.endsWith('/git/trees')) return { sha: 'fork-tree' };
      if (call.route.endsWith('/git/commits')) return { sha: 'fork-commit' };
      if (call.route.endsWith('/git/refs')) {
        refWritten = true;
        return {};
      }
      if (call.route === 'PATCH /repos/{owner}/{repo}') {
        visibilityAttempts += 1;
        if (visibilityAttempts === 1) throw new GitHubRequestError('connection lost', 500);
        return {};
      }
      return {};
    });
    const operation = {
      kind: 'fork' as const,
      sourceGameId: 'game-1',
      sourceSha: 'source-commit',
      newGameId: 'game-2',
      owner: 'alice',
      visibility: 'public' as const,
    };
    const context = contextWith(request);

    await expect(fork(operation, context)).rejects.toThrow('connection lost');
    await expect(fork(operation, context)).resolves.toEqual({ ok: true, sha: 'fork-commit' });
    expect(calls.filter((call) => call.route.endsWith('/git/refs'))).toHaveLength(1);
    expect(visibilityAttempts).toBe(2);
  });

  it('copies fork blobs with at most eight concurrent reads and stable tree order', async () => {
    let activeReads = 0;
    let maxActiveReads = 0;
    const paths = Array.from({ length: 10 }, (_, index) => `src/file-${index}.ts`);
    const { request, calls } = fakeRequest(async (call) => {
      if (call.route.endsWith('/git/commits/{commit_sha}')) return { tree: { sha: 'source-tree' } };
      if (call.route.endsWith('/git/trees/{tree_sha}')) {
        return {
          truncated: false,
          tree: paths.map((path, index) => ({
            path,
            mode: '100644',
            type: 'blob',
            sha: `source-${index}`,
            size: index + 1,
          })),
        };
      }
      if (call.route.endsWith('/git/blobs/{file_sha}')) {
        activeReads += 1;
        maxActiveReads = Math.max(maxActiveReads, activeReads);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        activeReads -= 1;
        return { content: String(call.parameters.file_sha), encoding: 'utf-8' };
      }
      if (call.route.endsWith('/git/blobs')) return { sha: `copied-${String(call.parameters.content)}` };
      if (call.route.endsWith('/git/trees')) return { sha: 'fork-tree' };
      if (call.route.endsWith('/git/commits')) return { sha: 'fork-commit' };
      return {};
    });

    await expect(
      fork(
        {
          kind: 'fork',
          sourceGameId: 'game-1',
          sourceSha: 'source-commit',
          newGameId: 'game-2',
          owner: 'alice',
          visibility: 'private',
        },
        contextWith(request),
      ),
    ).resolves.toEqual({ ok: true, sha: 'fork-commit' });
    expect(maxActiveReads).toBe(8);
    const tree = calls.find((call) => call.route.endsWith('/git/trees'));
    expect((tree?.parameters.tree as { path: string }[]).map((item) => item.path)).toEqual(paths);
  });

  it('refuses a fork that exceeds the file-count limit before creating the destination', async () => {
    const { request, calls } = fakeRequest((call) => {
      if (call.route.endsWith('/git/commits/{commit_sha}')) return { tree: { sha: 'source-tree' } };
      if (call.route.endsWith('/git/trees/{tree_sha}')) {
        return {
          truncated: false,
          tree: Array.from({ length: MAX_FORK_FILES + 1 }, (_, index) => ({
            path: `src/file-${index}.ts`,
            mode: '100644',
            type: 'blob',
            sha: `source-${index}`,
            size: 1,
          })),
        };
      }
      throw new Error(`unexpected route ${call.route}`);
    });

    await expect(
      fork(
        {
          kind: 'fork',
          sourceGameId: 'game-1',
          sourceSha: 'source-commit',
          newGameId: 'game-2',
          owner: 'alice',
          visibility: 'private',
        },
        contextWith(request),
      ),
    ).resolves.toMatchObject({ ok: false, verdict: { reasons: [{ code: 'size' }] } });
    expect(calls.some((call) => call.route === 'POST /user/repos')).toBe(false);
  });

  it('refuses a fork that exceeds the total-byte limit before creating the destination', async () => {
    const { request, calls } = fakeRequest((call) => {
      if (call.route.endsWith('/git/commits/{commit_sha}')) return { tree: { sha: 'source-tree' } };
      if (call.route.endsWith('/git/trees/{tree_sha}')) {
        return {
          truncated: false,
          tree: [
            {
              path: 'assets/game.bin',
              mode: '100644',
              type: 'blob',
              sha: 'large-blob',
              size: MAX_FORK_BYTES + 1,
            },
          ],
        };
      }
      throw new Error(`unexpected route ${call.route}`);
    });

    await expect(
      fork(
        {
          kind: 'fork',
          sourceGameId: 'game-1',
          sourceSha: 'source-commit',
          newGameId: 'game-2',
          owner: 'alice',
          visibility: 'private',
        },
        contextWith(request),
      ),
    ).resolves.toMatchObject({ ok: false, verdict: { reasons: [{ code: 'size' }] } });
    expect(calls.some((call) => call.route === 'POST /user/repos')).toBe(false);
  });

  it('does not make a completed fork public when the gate refuses it', async () => {
    const { request, calls } = fakeRequest((call) => {
      if (call.route.endsWith('/git/commits/{commit_sha}')) return { tree: { sha: 'source-tree' } };
      if (call.route.endsWith('/git/trees/{tree_sha}')) return { truncated: false, tree: [] };
      if (call.route.endsWith('/git/trees')) return { sha: 'fork-tree' };
      if (call.route.endsWith('/git/commits')) return { sha: 'fork-commit' };
      return {};
    });
    const evaluate = vi.fn(async () => ({
      allowed: false as const,
      reasons: [{ code: 'denylist' as const, detail: 'blocked' }],
    }));
    const context = contextWith(request, {
      gate: { evaluate },
    });
    await expect(
      fork(
        {
          kind: 'fork',
          sourceGameId: 'game-1',
          sourceSha: 'source-commit',
          newGameId: 'game-2',
          owner: 'alice',
          visibility: 'public',
        },
        context,
      ),
    ).resolves.toMatchObject({ ok: false });
    expect(calls.some((call) => call.route === 'PATCH /repos/{owner}/{repo}')).toBe(false);
    expect(evaluate).toHaveBeenCalledWith(expect.objectContaining({ sha: 'fork-commit' }));
  });
});
