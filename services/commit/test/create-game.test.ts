import { describe, expect, it } from 'vitest';

import { createGame, MAX_COPY_BYTES, MAX_COPY_FILES } from '../src/ops/create-game.js';
import type { GameRepository } from '../src/types.js';
import { contextWith, fakeRequest } from './helpers.js';

const FOLDER = 'games/castle-game';

// The folder read that create_game starts with: a commit, then its recursive tree.
function folderTree(entries: { path: string; sha?: string; size?: number; type?: string }[] = []): unknown {
  return {
    truncated: false,
    tree: entries.map((entry) => ({
      path: `${FOLDER}/${entry.path}`,
      mode: '100644',
      type: entry.type ?? 'blob',
      sha: entry.sha ?? `blob-${entry.path}`,
      size: entry.size ?? 1,
    })),
  };
}

function repositoryOf(): GameRepository {
  return { owner: 'alice', name: 'instance', visibility: 'private', path: FOLDER, slug: 'castle-game' };
}

function sourceRepository(): GameRepository {
  return { ...repositoryOf(), path: 'games/source-game', slug: 'source-game' };
}

describe('create_game', () => {
  it('adds games/<slug>/ from the template on a branch and merges it as the bot', async () => {
    const { request, calls } = fakeRequest((call) => {
      if (call.route.endsWith('/git/ref/{ref}')) return { object: { sha: 'main-1' } };
      if (call.route.endsWith('/git/trees/{tree_sha}')) return folderTree();
      if (call.route.endsWith('/git/commits/{commit_sha}')) return { tree: { sha: 'base-tree' } };
      if (call.route.endsWith('/git/blobs')) return { sha: `blob-${calls.length}` };
      if (call.route.endsWith('/git/trees')) return { sha: 'new-tree' };
      if (call.route.endsWith('/git/commits')) return { sha: 'folder-commit' };
      if (call.route === 'POST /repos/{owner}/{repo}/pulls') return { number: 7, title: 'Add game castle-game' };
      if (call.route.endsWith('/pulls/{pull_number}/merge')) return { merged: true, message: 'ok', sha: 'merge-1' };
      return {};
    });
    const templates = {
      async render() {
        return {
          files: [
            { path: 'README.md', content: '# castle\n' },
            { path: 'design/design.json', content: '{}' },
            { path: '.github/workflows/ci.yml', content: 'name: ci\n' },
          ],
          labels: [],
          requiredChecks: ['ci / required', 'ogm/boundary'],
        };
      },
    };
    const result = await createGame(
      { kind: 'create_game', gameId: 'game-1', slug: 'castle-game', templateRef: 'default', visibility: 'private' },
      contextWith(request, { templates }),
    );

    expect(result).toEqual({ ok: true, sha: 'merge-1' });
    const tree = calls.find((call) => call.route.endsWith('/git/trees'))!.parameters.tree as { path: string }[];
    // Every file lands in the game's folder; the workflow belongs to the instance repository, not the game.
    expect(tree.map(({ path }) => path)).toEqual([`${FOLDER}/README.md`, `${FOLDER}/design/design.json`]);
    expect(calls.find((call) => call.route === 'POST /repos/{owner}/{repo}/labels')?.parameters).toMatchObject({
      name: 'game:castle-game',
    });
    expect(calls.find((call) => call.route === 'POST /repos/{owner}/{repo}/pulls')?.parameters).toMatchObject({
      head: 'game/castle-game',
      base: 'main',
    });
    expect(calls.find((call) => call.route.endsWith('/pulls/{pull_number}/merge'))?.parameters).toMatchObject({
      sha: 'folder-commit',
      merge_method: 'squash',
    });
    expect(calls.some((call) => call.route === 'POST /user/repos')).toBe(false);
  });

  it('refuses a game whose folder is already in the instance repository', async () => {
    const { request, calls } = fakeRequest((call) => {
      if (call.route.endsWith('/git/ref/{ref}')) return { object: { sha: 'main-1' } };
      if (call.route.endsWith('/git/commits/{commit_sha}')) return { tree: { sha: 'base-tree' } };
      if (call.route.endsWith('/git/trees/{tree_sha}')) return folderTree([{ path: 'README.md' }]);
      throw new Error(`unexpected route ${call.route}`);
    });
    await expect(
      createGame(
        { kind: 'create_game', gameId: 'game-1', slug: 'castle-game', templateRef: 'default', visibility: 'private' },
        contextWith(request),
      ),
    ).resolves.toMatchObject({ ok: false, verdict: { reasons: [{ code: 'denylist' }] } });
    expect(calls.some((call) => call.route.endsWith('/git/trees'))).toBe(false);
  });

  it('refuses a registry path that does not match the slug', async () => {
    const { request, calls } = fakeRequest(() => ({}));
    await expect(
      createGame(
        { kind: 'create_game', gameId: 'game-1', slug: 'castle-game', templateRef: 'default', visibility: 'private' },
        contextWith(request, {}, { ...repositoryOf(), path: 'games/other-game' }),
      ),
    ).resolves.toMatchObject({ ok: false, verdict: { reasons: [{ code: 'path' }] } });
    expect(calls).toHaveLength(0);
  });

  it('reuses source blobs when a fork stays in the instance repository', async () => {
    const { request, calls } = fakeRequest((call) => {
      if (call.route.endsWith('/git/ref/{ref}')) return { object: { sha: 'main-1' } };
      if (call.route.endsWith('/git/commits/{commit_sha}')) {
        return { tree: { sha: call.parameters.commit_sha === 'source-commit' ? 'source-tree' : 'base-tree' } };
      }
      if (call.route.endsWith('/git/trees/{tree_sha}')) {
        return call.parameters.tree_sha === 'source-tree'
          ? {
              truncated: false,
              tree: [
                {
                  path: 'games/source-game/design/design.json',
                  mode: '100644',
                  type: 'blob',
                  sha: 'source-blob',
                  size: 3,
                },
                { path: 'games/source-game/saves/slot.json', mode: '100644', type: 'blob', sha: 'save', size: 2 },
              ],
            }
          : folderTree();
      }
      if (call.route.endsWith('/git/trees')) return { sha: 'fork-tree' };
      if (call.route.endsWith('/git/commits')) return { sha: 'fork-commit' };
      if (call.route === 'POST /repos/{owner}/{repo}/pulls') return { number: 9, title: 'Fork source-game' };
      if (call.route.endsWith('/pulls/{pull_number}/merge')) return { merged: true, message: 'ok', sha: 'fork-merge' };
      return {};
    });
    const source = sourceRepository();
    const destination = repositoryOf();
    const result = await createGame(
      {
        kind: 'create_game',
        gameId: 'game-2',
        slug: 'castle-game',
        templateRef: 'default',
        visibility: 'private',
        from: { gameId: 'game-1', sha: 'source-commit' },
      },
      contextWith(request, {
        repos: {
          async resolve(gameId) {
            return gameId === 'game-1' ? source : destination;
          },
        },
      }),
    );

    expect(result).toEqual({ ok: true, sha: 'fork-merge' });
    expect(calls.some((call) => call.route.endsWith('/git/blobs'))).toBe(false);
    const tree = calls.find((call) => call.route.endsWith('/git/trees'))!.parameters.tree as {
      path: string;
      sha: string;
    }[];
    // The source blobs are already in the repository, so the fork only re-points them into the new folder.
    expect(tree).toEqual([{ path: `${FOLDER}/design/design.json`, mode: '100644', type: 'blob', sha: 'source-blob' }]);
    expect(calls.find((call) => call.route.endsWith('/git/commits'))?.parameters).toMatchObject({
      message: 'fork: game-1@source-commit\n\nForked-From: game-1@source-commit',
    });
  });

  it('copies blobs when a fork comes from another repository', async () => {
    const { request, calls } = fakeRequest((call) => {
      if (call.route.endsWith('/git/ref/{ref}')) return { object: { sha: 'main-1' } };
      if (call.route.endsWith('/git/commits/{commit_sha}')) {
        return { tree: { sha: call.parameters.commit_sha === 'source-commit' ? 'source-tree' : 'base-tree' } };
      }
      if (call.route.endsWith('/git/trees/{tree_sha}')) {
        return call.parameters.tree_sha === 'source-tree'
          ? {
              truncated: false,
              tree: [
                { path: 'games/source-game/README.md', mode: '100644', type: 'blob', sha: 'old-blob', size: 4 },
                { path: 'games/source-game/saves/slot.json', mode: '100644', type: 'blob', sha: 'save', size: 2 },
              ],
            }
          : folderTree();
      }
      if (call.route.endsWith('/git/blobs/{file_sha}')) return { content: 'Y29udGVudA==', encoding: 'base64' };
      if (call.route.endsWith('/git/blobs')) return { sha: 'copied-blob' };
      if (call.route.endsWith('/git/trees')) return { sha: 'fork-tree' };
      if (call.route.endsWith('/git/commits')) return { sha: 'fork-commit' };
      if (call.route === 'POST /repos/{owner}/{repo}/pulls') return { number: 9, title: 'Fork' };
      if (call.route.endsWith('/pulls/{pull_number}/merge')) return { merged: true, message: 'ok', sha: 'fork-merge' };
      return {};
    });
    // A per-game repository kept read-only from before the instance monorepo: its game sits at the repository root.
    const source: GameRepository = { ...sourceRepository(), name: 'legacy-game' };
    await expect(
      createGame(
        {
          kind: 'create_game',
          gameId: 'game-2',
          slug: 'castle-game',
          templateRef: 'default',
          visibility: 'private',
          from: { gameId: 'game-1', sha: 'source-commit' },
        },
        contextWith(request, {
          repos: {
            async resolve(gameId) {
              return gameId === 'game-1' ? source : repositoryOf();
            },
          },
        }),
      ),
    ).resolves.toEqual({ ok: true, sha: 'fork-merge' });
    expect(calls.filter((call) => call.route.endsWith('/git/blobs/{file_sha}'))).toHaveLength(1);
    expect(calls.find((call) => call.route.endsWith('/git/trees'))?.parameters).toMatchObject({
      tree: [{ path: `${FOLDER}/README.md`, mode: '100644', type: 'blob', sha: 'copied-blob' }],
    });
  });

  it('refuses a fork over the file-count limit before writing anything', async () => {
    const { request, calls } = fakeRequest((call) => {
      if (call.route.endsWith('/git/ref/{ref}')) return { object: { sha: 'main-1' } };
      if (call.route.endsWith('/git/commits/{commit_sha}')) {
        return { tree: { sha: call.parameters.commit_sha === 'source-commit' ? 'source-tree' : 'base-tree' } };
      }
      if (call.route.endsWith('/git/trees/{tree_sha}')) {
        return {
          truncated: false,
          tree: Array.from({ length: MAX_COPY_FILES + 1 }, (_, index) => ({
            path: `games/source-game/src/file-${index}.ts`,
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
      createGame(
        {
          kind: 'create_game',
          gameId: 'game-2',
          slug: 'castle-game',
          templateRef: 'default',
          visibility: 'private',
          from: { gameId: 'game-1', sha: 'source-commit' },
        },
        contextWith(request, {
          repos: {
            async resolve(gameId) {
              return gameId === 'game-1' ? sourceRepository() : repositoryOf();
            },
          },
        }),
      ),
    ).resolves.toMatchObject({ ok: false, verdict: { reasons: [{ code: 'size' }] } });
    expect(calls.some((call) => call.route.endsWith('/git/trees') && call.parameters.tree !== undefined)).toBe(false);
  });

  it('refuses a fork over the byte limit before writing anything', async () => {
    const { request } = fakeRequest((call) => {
      if (call.route.endsWith('/git/ref/{ref}')) return { object: { sha: 'main-1' } };
      if (call.route.endsWith('/git/commits/{commit_sha}')) {
        return { tree: { sha: call.parameters.commit_sha === 'source-commit' ? 'source-tree' : 'base-tree' } };
      }
      if (call.route.endsWith('/git/trees/{tree_sha}')) {
        return {
          truncated: false,
          tree: [
            {
              path: 'games/source-game/assets/game.bin',
              mode: '100644',
              type: 'blob',
              sha: 'large',
              size: MAX_COPY_BYTES + 1,
            },
          ],
        };
      }
      throw new Error(`unexpected route ${call.route}`);
    });
    await expect(
      createGame(
        {
          kind: 'create_game',
          gameId: 'game-2',
          slug: 'castle-game',
          templateRef: 'default',
          visibility: 'private',
          from: { gameId: 'game-1', sha: 'source-commit' },
        },
        contextWith(request, {
          repos: {
            async resolve(gameId) {
              return gameId === 'game-1' ? sourceRepository() : repositoryOf();
            },
          },
        }),
      ),
    ).resolves.toMatchObject({ ok: false, verdict: { reasons: [{ code: 'size' }] } });
  });
});
