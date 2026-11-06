import { describe, expect, it } from 'vitest';

import { GitHubRequestError } from '../src/github-request.js';
import { release } from '../src/ops/release.js';
import { contextWith, fakeRequest } from './helpers.js';

const GAME_PATH = 'games/castle-game';

// The release check reads the game's folder at the released commit before tagging it.
function folderAt(route: string, folder: string | null): unknown {
  if (route.endsWith('/git/commits/{commit_sha}')) return { tree: { sha: 'tree-1' } };
  if (route.endsWith('/git/trees/{tree_sha}')) {
    return folder === null
      ? { truncated: false, tree: [] }
      : { truncated: false, tree: [{ path: folder, mode: '100644', type: 'blob', sha: 'blob-1' }] };
  }
  throw new Error(`unexpected route ${route}`);
}

describe('release retries', () => {
  // A publish whose release response was lost retries with the same version; refusing its own tag would wedge publishing.
  it('treats a retried release whose tag already points at the same commit as done', async () => {
    const retry = (taggedCommit: string) =>
      fakeRequest((call) => {
        if (call.route === 'POST /repos/{owner}/{repo}/git/tags') return { sha: 'tag-object-2' };
        if (call.route === 'POST /repos/{owner}/{repo}/git/refs') throw new GitHubRequestError('exists', 422);
        if (call.route.endsWith('/git/ref/{ref}')) return { object: { sha: 'tag-object-1', type: 'tag' } };
        if (call.route.endsWith('/git/tags/{tag_sha}')) return { object: { sha: taggedCommit } };
        return folderAt(call.route, `${GAME_PATH}/design/design.json`);
      });
    const op = { kind: 'release', gameId: 'game-1', sha: 'commit-1', semver: '1.2.3', changelog: 'New level' } as const;

    const same = retry('commit-1');
    await expect(release(op, contextWith(same.request))).resolves.toEqual({ ok: true, sha: 'tag-object-1' });
    const tagCall = same.calls.find((call) => call.route === 'POST /repos/{owner}/{repo}/git/tags');
    expect(tagCall?.parameters).toMatchObject({ tag: 'castle-game/v1.2.3' });
    await expect(release(op, contextWith(retry('commit-2').request))).resolves.toMatchObject({ ok: false });
  });

  // A 422 on ref creation that is not our own tag (no ref to read back) stays a clean refusal.
  it('refuses when the conflicting ref cannot be read back', async () => {
    const { request } = fakeRequest((call) => {
      if (call.route === 'POST /repos/{owner}/{repo}/git/tags') return { sha: 'tag-object-2' };
      if (call.route === 'POST /repos/{owner}/{repo}/git/refs') throw new GitHubRequestError('invalid', 422);
      if (call.route.endsWith('/git/ref/{ref}')) throw new GitHubRequestError('Not Found', 404);
      return folderAt(call.route, `${GAME_PATH}/design/design.json`);
    });
    await expect(
      release(
        { kind: 'release', gameId: 'game-1', sha: 'commit-1', semver: '1.2.3', changelog: 'New level' },
        contextWith(request),
      ),
    ).resolves.toMatchObject({ ok: false });
  });

  // A release commit that does not contain the game's folder is not that game's release.
  it('refuses a release commit without the game folder', async () => {
    const { request } = fakeRequest((call) => folderAt(call.route, null));
    await expect(
      release(
        { kind: 'release', gameId: 'game-1', sha: 'commit-1', semver: '1.2.3', changelog: 'New level' },
        contextWith(request),
      ),
    ).resolves.toEqual({
      ok: false,
      verdict: {
        allowed: false,
        reasons: [{ code: 'path', detail: 'release commit does not contain the game folder', path: GAME_PATH }],
      },
    });
  });
});
