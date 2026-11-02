import { describe, expect, it } from 'vitest';

import { GitHubRequestError } from '../src/github-request.js';
import { release } from '../src/ops/release.js';
import { contextWith, fakeRequest } from './helpers.js';

describe('release retries', () => {
  // A publish whose release response was lost retries with the same version; refusing its own tag would wedge publishing.
  it('treats a retried release whose tag already points at the same commit as done', async () => {
    const retry = (taggedCommit: string) =>
      fakeRequest((call) => {
        if (call.route === 'POST /repos/{owner}/{repo}/git/tags') return { sha: 'tag-object-2' };
        if (call.route === 'POST /repos/{owner}/{repo}/git/refs') throw new GitHubRequestError('exists', 422);
        if (call.route.endsWith('/git/ref/{ref}')) return { object: { sha: 'tag-object-1', type: 'tag' } };
        return { object: { sha: taggedCommit } };
      });
    const op = { kind: 'release', gameId: 'game-1', sha: 'commit-1', semver: '1.2.3', changelog: 'New level' } as const;

    const same = retry('commit-1');
    await expect(release(op, contextWith(same.request))).resolves.toEqual({ ok: true, sha: 'tag-object-1' });
    expect(same.calls[2]?.parameters).toMatchObject({ ref: 'tags/gm/game-1/v1.2.3' });
    await expect(release(op, contextWith(retry('commit-2').request))).resolves.toMatchObject({ ok: false });
  });

  // A 422 on ref creation that is not our own tag (no ref to read back) stays a clean refusal.
  it('refuses when the conflicting ref cannot be read back', async () => {
    const { request } = fakeRequest((call) => {
      if (call.route === 'POST /repos/{owner}/{repo}/git/tags') return { sha: 'tag-object-2' };
      if (call.route === 'POST /repos/{owner}/{repo}/git/refs') throw new GitHubRequestError('invalid', 422);
      throw new GitHubRequestError('Not Found', 404);
    });
    await expect(
      release(
        { kind: 'release', gameId: 'game-1', sha: 'commit-1', semver: '1.2.3', changelog: 'New level' },
        contextWith(request),
      ),
    ).resolves.toMatchObject({ ok: false });
  });
});
