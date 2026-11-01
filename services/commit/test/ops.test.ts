import { describe, expect, it } from 'vitest';

import { GitHubRequestError } from '../src/github-request.js';
import { createBranch } from '../src/ops/create-branch.js';
import { createRepo } from '../src/ops/create-repo.js';
import { fileIssue } from '../src/ops/file-issue.js';
import { foldDesign } from '../src/ops/fold-design.js';
import { fork } from '../src/ops/fork.js';
import { merge } from '../src/ops/merge.js';
import { release } from '../src/ops/release.js';
import { setVisibility } from '../src/ops/set-visibility.js';
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
    const result = await foldDesign(
      {
        kind: 'fold_design',
        gameId: 'game-1',
        base: 'old-base',
        files: [{ path: 'design/entities.json', content: '{}' }],
      },
      contextWith(request),
    );
    expect(result).toEqual({ ok: true, sha: 'commit-2' });
    expect(refUpdates).toBe(2);
    expect(calls.filter((call) => call.route.endsWith('/git/ref/{ref}'))).toHaveLength(1);
    expect(calls.at(-1)?.parameters).toMatchObject({ force: false });
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
      foldDesign(
        { kind: 'fold_design', gameId: 'game-1', base: 'base', files: [] },
        contextWith(request),
      ),
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
    await expect(
      merge({ kind: 'merge', gameId: 'game-1', prNumber: 7 }, contextWith(request)),
    ).resolves.toEqual({ ok: true, sha: 'merge-456' });
    expect(calls[1]?.parameters).toMatchObject({ sha: 'head-123', merge_method: 'squash' });
  });

  it('creates an annotated release tag', async () => {
    const { request, calls } = fakeRequest((call) =>
      call.route.endsWith('/git/tags') ? { sha: 'tag-object' } : {},
    );
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
            { path: 'src/game.ts', mode: '100644', type: 'blob', sha: 'source-blob' },
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
});
