import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { registryProfile } from '../src/profile.js';
import { applySwitch, planSwitch } from '../src/switch.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures', 'instance-vendored');
const SHA = '3cef9ec65caaf2dfa51649cc8befb9a916c8487b';
const npmjs = registryProfile({ scope: '@its-owner' });

const versions = new Map([
  ['@ogm/contracts', '0.0.0-core.3cef9ec65caa'],
  ['@gm/sdk', '0.0.0-core.3cef9ec65caa'],
  ['@gm/pack-kaykit', '0.0.0-core.3cef9ec65caa'],
]);

const dirs: string[] = [];

afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

/** A copy of the vendored instance layout with the tarballs the manifests point at. */
async function instanceRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'core-release-switch-'));
  dirs.push(dir);
  await cp(fixture, dir, { recursive: true });
  await mkdir(join(dir, 'vendor'), { recursive: true });
  for (const tarball of [
    'gm-sdk-3cef9ec65caa.tgz',
    'ogm-contracts-3cef9ec65caa.tgz',
    'gm-pack-kaykit-3cef9ec65caa.tgz',
  ]) {
    await writeFile(join(dir, 'vendor', tarball), 'vendored tarball placeholder\n');
  }
  return dir;
}

describe('planSwitch', () => {
  it('plans registry specifiers for every core dependency and the tarballs it leaves behind', async () => {
    const dir = await instanceRepo();
    const plan = await planSwitch({ dir, profile: npmjs, versions, coreSha: SHA });

    expect(plan.pin).toBe(SHA);
    expect(plan.dependencies).toEqual([
      {
        manifest: 'games/example-2d/package.json',
        dependency: '@gm/sdk',
        from: 'file:../../vendor/gm-sdk-3cef9ec65caa.tgz',
        to: 'npm:@its-owner/sdk@0.0.0-core.3cef9ec65caa',
      },
      {
        manifest: 'games/example-2d/package.json',
        dependency: '@ogm/contracts',
        from: 'file:../../vendor/ogm-contracts-3cef9ec65caa.tgz',
        to: 'npm:@its-owner/contracts@0.0.0-core.3cef9ec65caa',
      },
      {
        manifest: 'packages/shared/package.json',
        dependency: '@gm/pack-kaykit',
        from: 'file:../../vendor/gm-pack-kaykit-3cef9ec65caa.tgz',
        to: 'npm:@its-owner/pack-kaykit@0.0.0-core.3cef9ec65caa',
      },
      {
        manifest: 'packages/shared/package.json',
        dependency: '@gm/sdk',
        from: 'workspace:*',
        to: 'npm:@its-owner/sdk@0.0.0-core.3cef9ec65caa',
      },
    ]);
    expect(plan.deletions).toEqual([
      'vendor/gm-pack-kaykit-3cef9ec65caa.tgz',
      'vendor/gm-sdk-3cef9ec65caa.tgz',
      'vendor/ogm-contracts-3cef9ec65caa.tgz',
    ]);
    expect(plan.npmrc.created).toBe(false);
    expect(plan.notes).toEqual(['.npmrc had offline=true; commented it out so registry installs resolve']);
  });

  it('keeps the original names when the destination registry accepts them', async () => {
    const dir = await instanceRepo();
    const plan = await planSwitch({
      dir,
      profile: registryProfile({ scope: '@gm', registry: 'http://127.0.0.1:4873' }),
      versions,
      coreSha: SHA,
    });
    const sdk = plan.dependencies.find(
      (edit) => edit.dependency === '@gm/sdk' && edit.manifest === 'games/example-2d/package.json',
    );
    expect(sdk?.to).toBe('0.0.0-core.3cef9ec65caa');
  });

  it('matches the expected diff for a copy of the instance layout', async () => {
    const dir = await instanceRepo();
    const plan = await planSwitch({ dir, profile: npmjs, versions, coreSha: SHA });
    const expected = await readFile(join(here, 'fixtures', 'instance-vendored.expected.patch'), 'utf8');
    expect(plan.diff).toBe(expected);
  });

  it('writes nothing while planning', async () => {
    const dir = await instanceRepo();
    const before = await readFile(join(dir, 'games/example-2d/package.json'), 'utf8');
    await planSwitch({ dir, profile: npmjs, versions, coreSha: SHA });
    expect(await readFile(join(dir, 'games/example-2d/package.json'), 'utf8')).toBe(before);
    expect((await stat(join(dir, 'vendor/gm-sdk-3cef9ec65caa.tgz'))).isFile()).toBe(true);
  });

  it('refuses to switch when the release versions come from another commit than the pin', async () => {
    const dir = await instanceRepo();
    await expect(planSwitch({ dir, profile: npmjs, versions, coreSha: 'a'.repeat(40) })).rejects.toThrow(
      /pins 3cef9ec65caa but the release versions come from aaaaaaaaaaaa/,
    );
  });

  it('refuses a repository without vendor/core.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'core-release-switch-empty-'));
    dirs.push(dir);
    await expect(planSwitch({ dir, profile: npmjs, versions, coreSha: SHA })).rejects.toThrow(/no vendor\/core.json/);
  });

  it('creates .npmrc when the instance repository has none', async () => {
    const dir = await instanceRepo();
    await rm(join(dir, '.npmrc'));
    const plan = await planSwitch({ dir, profile: npmjs, versions, coreSha: SHA });
    expect(plan.npmrc.created).toBe(true);
    expect(plan.npmrc.after).toContain('@its-owner:registry=https://registry.npmjs.org');
  });

  it('keeps a tarball another dependency still points at', async () => {
    const dir = await instanceRepo();
    const manifestPath = join(dir, 'games/example-2d/package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { dependencies: Record<string, string> };
    manifest.dependencies['@ogm/vendored-thing'] = 'file:../../vendor/gm-sdk-3cef9ec65caa.tgz';
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const plan = await planSwitch({ dir, profile: npmjs, versions, coreSha: SHA });
    expect(plan.deletions).not.toContain('vendor/gm-sdk-3cef9ec65caa.tgz');
    expect(plan.notes).toContain('vendor/gm-sdk-3cef9ec65caa.tgz is still referenced by another dependency; kept');
  });

  it('reports when there is nothing to switch', async () => {
    const dir = await instanceRepo();
    await applySwitch(await planSwitch({ dir, profile: npmjs, versions, coreSha: SHA }));
    const plan = await planSwitch({ dir, profile: npmjs, versions, coreSha: SHA });
    expect(plan.dependencies).toEqual([]);
  });
});

describe('applySwitch', () => {
  it('writes the manifests and removes the tarballs the plan lists', async () => {
    const dir = await instanceRepo();
    const plan = await planSwitch({ dir, profile: npmjs, versions, coreSha: SHA });
    await applySwitch(plan);

    const manifest = JSON.parse(await readFile(join(dir, 'games/example-2d/package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(manifest.dependencies['@gm/sdk']).toBe('npm:@its-owner/sdk@0.0.0-core.3cef9ec65caa');
    expect(manifest.dependencies.phaser).toBe('4.2.1');
    const npmrc = await readFile(join(dir, '.npmrc'), 'utf8');
    expect(npmrc).toContain('# >>> core packages registry');
    expect(npmrc).not.toContain('\noffline=true');
    expect(await stat(join(dir, 'vendor/gm-sdk-3cef9ec65caa.tgz')).catch(() => null)).toBeNull();
    expect(await stat(join(dir, 'vendor/core.json'))).not.toBeNull();
  });

  it('is idempotent: a second switch plans nothing', async () => {
    const dir = await instanceRepo();
    await applySwitch(await planSwitch({ dir, profile: npmjs, versions, coreSha: SHA }));
    const second = await planSwitch({ dir, profile: npmjs, versions, coreSha: SHA });
    expect(second.dependencies).toEqual([]);
    expect(second.notes).toContain(
      'nothing to switch: no core dependency uses a local protocol and .npmrc already names the registry',
    );
  });
});
