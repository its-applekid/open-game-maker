import { describe, expect, it } from 'vitest';

import { DefaultBoundaryGate } from '../src/gate.js';

const privateRepo = { owner: 'alice', name: 'gm-game-1', visibility: 'private' as const };
const publicRepo = { ...privateRepo, visibility: 'public' as const };

describe('DefaultBoundaryGate', () => {
  const gate = new DefaultBoundaryGate();

  it('refuses public visibility without the real content gate', async () => {
    const verdict = await gate.evaluate({
      kind: 'set_visibility',
      repository: privateRepo,
      targetVisibility: 'public',
    });
    expect(verdict).toEqual({
      allowed: false,
      reasons: [{ code: 'denylist', detail: 'content gate not installed (OGM-039)' }],
    });
  });

  it('refuses a release from a public repository', async () => {
    await expect(gate.evaluate({ kind: 'release', repository: publicRepo })).resolves.toMatchObject({
      allowed: false,
    });
  });

  it('allows a private release and a private visibility change', async () => {
    await expect(gate.evaluate({ kind: 'release', repository: privateRepo })).resolves.toEqual({
      allowed: true,
      reasons: [],
    });
    await expect(
      gate.evaluate({
        kind: 'set_visibility',
        repository: publicRepo,
        targetVisibility: 'private',
      }),
    ).resolves.toMatchObject({ allowed: true });
  });
});
