import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ReleaseError, buildWorkspace, loadWorkspace, releaseOrder, releaseSet } from '../src/graph.js';
import type { RunCommand } from '../src/run.js';

const dirs: string[] = [];

async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'core-release-graph-'));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

const engine = {
  name: '@gm/sdk',
  version: '0.0.0',
  dependencies: { '@ogm/contracts': 'workspace:*', '@ogm/iframe-bridge': 'workspace:*', zod: '4.6.7' },
};

const workspace = () =>
  buildWorkspace('/workspace', [
    { dir: '/workspace/packages/contracts', manifest: { name: '@ogm/contracts', version: '0.0.0' } },
    {
      dir: '/workspace/packages/iframe-bridge',
      manifest: { name: '@ogm/iframe-bridge', version: '0.0.0', dependencies: { '@ogm/contracts': 'workspace:*' } },
    },
    { dir: '/workspace/packages/sdk', manifest: engine },
    {
      dir: '/workspace/packages/pack-adapters/kaykit',
      manifest: {
        name: '@gm/pack-kaykit',
        version: '0.0.0',
        peerDependencies: { '@gm/sdk': 'workspace:*', three: '0.186.1' },
      },
    },
  ]);

describe('workspaceDependencies', () => {
  it('collects workspace specs from dependencies, optional and peer dependencies only', () => {
    const pkg = workspace().packages.get('@gm/pack-kaykit');
    expect(pkg?.workspaceDependencies).toEqual(['@gm/sdk']);
  });
});

describe('buildWorkspace', () => {
  it('refuses a workspace with a duplicate package name', () => {
    expect(() =>
      buildWorkspace('/workspace', [
        { dir: '/workspace/a', manifest: { name: '@gm/sdk', version: '0.0.0' } },
        { dir: '/workspace/b', manifest: { name: '@gm/sdk', version: '0.0.0' } },
      ]),
    ).toThrow(/duplicate package name @gm\/sdk/);
  });
});

describe('releaseOrder', () => {
  it('releases leaves before the consumers that import them', () => {
    const order = releaseOrder(workspace(), ['@gm/sdk', '@gm/pack-kaykit']).map((pkg) => pkg.name);
    expect(order).toEqual(['@ogm/contracts', '@ogm/iframe-bridge', '@gm/sdk', '@gm/pack-kaykit']);
  });

  it('is deterministic when roots and dependencies are listed in another order', () => {
    const first = releaseOrder(workspace(), ['@gm/pack-kaykit', '@gm/sdk']).map((pkg) => pkg.name);
    const second = releaseOrder(workspace(), ['@gm/sdk', '@gm/pack-kaykit']).map((pkg) => pkg.name);
    expect(first).toEqual(second);
  });

  it('refuses a root that is not a workspace package', () => {
    expect(() => releaseOrder(workspace(), ['@gm/missing'])).toThrow(
      /core release root @gm\/missing is not a workspace package/,
    );
  });

  it('refuses a workspace dependency that the workspace does not contain', () => {
    const broken = buildWorkspace('/workspace', [
      {
        dir: '/workspace/sdk',
        manifest: { name: '@gm/sdk', version: '0.0.0', dependencies: { '@ogm/ghost': 'workspace:*' } },
      },
    ]);
    expect(() => releaseOrder(broken, ['@gm/sdk'])).toThrow(/@gm\/sdk declares workspace dependency @ogm\/ghost/);
  });

  it('refuses a dependency cycle and names the path', () => {
    const cyclic = buildWorkspace('/workspace', [
      { dir: '/a', manifest: { name: '@gm/a', version: '0.0.0', dependencies: { '@gm/b': 'workspace:*' } } },
      { dir: '/b', manifest: { name: '@gm/b', version: '0.0.0', dependencies: { '@gm/a': 'workspace:*' } } },
    ]);
    expect(() => releaseOrder(cyclic, ['@gm/a'])).toThrow(/cycle: @gm\/a -> @gm\/b -> @gm\/a/);
  });
});

describe('releaseSet', () => {
  it('maps the closure by source name', () => {
    const set = releaseSet(workspace(), ['@gm/sdk']);
    expect([...set.keys()]).toEqual(['@ogm/contracts', '@ogm/iframe-bridge', '@gm/sdk']);
  });
});

describe('loadWorkspace', () => {
  it('reads manifests from the paths pnpm lists', async () => {
    const dir = await scratch();
    await mkdir(join(dir, 'packages/sdk'), { recursive: true });
    await writeFile(join(dir, 'packages/sdk/package.json'), JSON.stringify({ name: '@gm/sdk', version: '0.0.0' }));
    const run: RunCommand = async () => ({
      code: 0,
      stdout: JSON.stringify([{ name: '@gm/sdk', path: join(dir, 'packages/sdk') }]),
      stderr: '',
    });
    const loaded = await loadWorkspace(dir, run);
    expect(loaded.packages.get('@gm/sdk')?.dir).toBe(join(dir, 'packages/sdk'));
  });

  it('fails closed when pnpm cannot list the workspace', async () => {
    const run: RunCommand = async () => ({ code: 1, stdout: '', stderr: 'ERR_PNPM_NO_LOCKFILE' });
    await expect(loadWorkspace('/workspace', run)).rejects.toBeInstanceOf(ReleaseError);
  });
});
