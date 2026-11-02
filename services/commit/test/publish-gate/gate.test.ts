import { describe, expect, it, vi } from 'vitest';

import type { AssetsLock, LockEntry } from '@ogm/contracts';

import type { BoundaryApi } from '../../src/boundary/api-client.js';
import type { BlocklistLoader } from '../../src/boundary/blocklist.js';
import { RealBoundaryGate } from '../../src/publish-gate/gate.js';
import type { GitHubApp, GitHubRequest, Repository } from '../../src/types.js';
import { contextWith, fakeRequest } from '../helpers.js';

const repository: Repository = { owner: 'alice', name: 'gm-game-1', visibility: 'private' };
const sha256 = '0'.repeat(64);

function lock(assets: LockEntry[] = []): AssetsLock {
  return { version: 1, family: 'any', pov: 'iso', assets };
}

function encoded(value: string): { content: string; encoding: 'base64'; size: number } {
  return { content: Buffer.from(value).toString('base64'), encoding: 'base64', size: Buffer.byteLength(value) };
}

function dependencies(request: GitHubRequest): { app: GitHubApp; api: BoundaryApi; blocklist: BlocklistLoader } {
  return {
    app: contextWith(request).app,
    api: {
      async activeRepositories() {
        return [];
      },
      async piiTerms() {
        return [];
      },
    },
    blocklist: {
      async load() {
        return new Set<string>();
      },
    },
  };
}

function treeRequest(lockfile: AssetsLock, includeAsset: boolean): GitHubRequest {
  const lockBody = JSON.stringify(lockfile);
  return fakeRequest((call) => {
    if (call.route.endsWith('/git/ref/{ref}')) return { object: { sha: 'main-sha' } };
    if (call.route.endsWith('/git/commits/{commit_sha}')) return { tree: { sha: 'tree-sha' } };
    if (call.route.endsWith('/git/trees/{tree_sha}')) {
      return {
        truncated: false,
        tree: [
          { path: 'assets.lock.json', mode: '100644', type: 'blob', sha: 'lock-sha', size: lockBody.length },
          ...(includeAsset
            ? [{ path: 'assets/props/barrel.glb', mode: '100644', type: 'blob', sha: 'asset-sha', size: 1 }]
            : []),
        ],
      };
    }
    if (call.route.endsWith('/git/blobs/{file_sha}')) {
      return call.parameters.file_sha === 'lock-sha' ? encoded(lockBody) : encoded('x');
    }
    throw new Error(`unexpected route ${call.route}`);
  }).request;
}

describe('RealBoundaryGate', () => {
  it('refuses making a Synty tree public and names the asset', async () => {
    const asset: LockEntry = {
      id: 't1:synty-polygon-dungeon/barrel@1.0',
      sha256,
      path: 'assets/props/barrel.glb',
      license: 'LicenseRef-Synty',
      rights: { uses: ['in-game'], audience: 'private', redistribution: 'in-build', attribution: null },
      added: '2026-11-01',
    };
    const gate = new RealBoundaryGate(dependencies(treeRequest(lock([asset]), true)));

    const verdict = await gate.evaluate({
      kind: 'set_visibility',
      gameId: 'game-1',
      repository,
      targetVisibility: 'public',
    });

    expect(verdict).toMatchObject({
      allowed: false,
      reasons: [
        expect.objectContaining({ code: 'rights', path: asset.path, detail: expect.stringContaining(asset.id) }),
      ],
    });
  });

  it('allows releasing a clean private tree', async () => {
    const gate = new RealBoundaryGate(dependencies(treeRequest(lock(), false)));

    await expect(
      gate.evaluate({
        kind: 'release',
        gameId: 'game-1',
        repository,
        sha: 'release-sha',
      }),
    ).resolves.toEqual({ allowed: true, reasons: [] });
  });

  it('checks inline fold content against the diff rules', async () => {
    const request = fakeRequest((call) => {
      if (call.route.endsWith('/contents/{path}')) return encoded(JSON.stringify(lock()));
      throw new Error(`unexpected route ${call.route}`);
    }).request;
    const gate = new RealBoundaryGate(dependencies(request));

    const verdict = await gate.evaluate({
      kind: 'fold_design',
      gameId: 'game-1',
      repository,
      sha: 'base-sha',
      files: [
        { path: 'design/secrets.ts', bytes: 40, content: 'const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";' },
      ],
    });

    expect(verdict).toMatchObject({ allowed: false, reasons: [expect.objectContaining({ code: 'secret' })] });
  });

  it('fails closed without leaking an I/O error message', async () => {
    const gate = new RealBoundaryGate({
      ...dependencies(fakeRequest(() => ({})).request),
      app: {
        forOwner: vi.fn(async () => {
          throw new TypeError('credential leaked here');
        }),
        async identity() {
          throw new Error('unused');
        },
      },
    });

    await expect(
      gate.evaluate({
        kind: 'release',
        gameId: 'game-1',
        repository,
        sha: 'release-sha',
      }),
    ).resolves.toEqual({
      allowed: false,
      reasons: [{ code: 'denylist', detail: 'gate error: TypeError' }],
    });
  });

  it('allows a private visibility change without reading the repository', async () => {
    const forOwner = vi.fn(async () => {
      throw new Error('must not run');
    });
    const gate = new RealBoundaryGate({
      ...dependencies(fakeRequest(() => ({})).request),
      app: {
        forOwner,
        async identity() {
          throw new Error('unused');
        },
      },
    });

    await expect(
      gate.evaluate({
        kind: 'set_visibility',
        gameId: 'game-1',
        repository: { ...repository, visibility: 'public' },
        targetVisibility: 'private',
      }),
    ).resolves.toEqual({ allowed: true, reasons: [] });
    expect(forOwner).not.toHaveBeenCalled();
  });
});
