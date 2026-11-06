import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildWorkspace, type Manifest } from '../src/graph.js';
import { registryProfile } from '../src/profile.js';
import { exportedPaths, internalSpecifier, publishedManifest, stagePackage } from '../src/stage.js';

const dirs: string[] = [];

async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'core-release-stage-'));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

const contracts: Manifest = {
  name: '@ogm/contracts',
  version: '0.0.0',
  private: true,
  type: 'module',
  types: './dist/index.d.ts',
  exports: {
    '.': { types: './dist/index.d.ts', default: './dist/index.js' },
    './schemas/*': './schemas/*',
    './fixtures/*': './fixtures/*',
  },
  bin: { 'validate-cards': 'bin/validate-cards.mjs' },
  scripts: { build: 'tsc -b' },
  dependencies: { ajv: '8.20.0' },
  devDependencies: { 'json-schema-to-typescript': '16.0.0', '@ogm/sdk': 'workspace:*' },
};

const sdk: Manifest = {
  name: '@gm/sdk',
  version: '0.0.0',
  private: true,
  type: 'module',
  exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
  scripts: { build: 'tsc -b && node scripts/build.mjs' },
  dependencies: { '@ogm/contracts': 'workspace:*', zod: '4.6.7' },
  peerDependencies: { '@ogm/iframe-bridge': 'workspace:*', tone: '15.1.22' },
  peerDependenciesMeta: { '@ogm/iframe-bridge': { optional: true } },
};

const names = new Map([
  ['@ogm/contracts', '@its-owner/contracts'],
  ['@ogm/iframe-bridge', '@its-owner/iframe-bridge'],
  ['@gm/sdk', '@its-owner/sdk'],
]);
const versions = new Map([
  ['@ogm/contracts', '0.0.0-core.3cef9ec65caa'],
  ['@ogm/iframe-bridge', '0.0.0-core.3cef9ec65caa'],
  ['@gm/sdk', '0.0.0-core.3cef9ec65caa'],
]);
const github = registryProfile({ scope: '@its-owner' });

function workspacePackage(dir: string, manifest: Manifest) {
  const built = buildWorkspace('/workspace', [{ dir, manifest }]);
  const pkg = built.packages.get(manifest.name);
  if (pkg === undefined) throw new Error('missing fixture package');
  return pkg;
}

describe('exportedPaths', () => {
  it('finds every top-level path the public surface points at', () => {
    expect(exportedPaths(contracts)).toEqual(['bin', 'dist', 'fixtures', 'schemas']);
  });
});

describe('internalSpecifier', () => {
  it('keeps the source name when the destination scope matches', () => {
    expect(internalSpecifier('@gm/sdk', new Map([['@gm/sdk', '@gm/sdk']]), versions)).toBe('0.0.0-core.3cef9ec65caa');
  });

  it('aliases to the published name so imports keep working', () => {
    expect(internalSpecifier('@ogm/contracts', names, versions)).toBe(
      'npm:@its-owner/contracts@0.0.0-core.3cef9ec65caa',
    );
  });

  it('refuses a workspace dependency outside the release plan', () => {
    expect(() => internalSpecifier('@ogm/ghost', names, versions)).toThrow(/not part of the release closure/);
  });
});

describe('publishedManifest', () => {
  it('renames, versions and drops the fields an install must not run', () => {
    const pkg = workspacePackage('/workspace/packages/contracts', contracts);
    const { manifest, files } = publishedManifest({ pkg, profile: github, names, versions });

    expect(manifest.name).toBe('@its-owner/contracts');
    expect(manifest.version).toBe('0.0.0-core.3cef9ec65caa');
    expect(manifest.private).toBeUndefined();
    expect(manifest.scripts).toBeUndefined();
    expect(manifest.publishConfig).toEqual({
      registry: 'https://npm.pkg.github.com',
      access: 'restricted',
      tag: 'core',
    });
    expect(manifest.files).toEqual(['bin', 'dist', 'fixtures', 'schemas']);
    expect(files).toEqual(['bin', 'dist', 'fixtures', 'schemas']);
  });

  it('rewrites workspace dependencies and peer dependencies to published specifiers', () => {
    const pkg = workspacePackage('/workspace/packages/sdk', sdk);
    const { manifest } = publishedManifest({ pkg, profile: github, names, versions });

    expect(manifest.dependencies).toEqual({
      '@ogm/contracts': 'npm:@its-owner/contracts@0.0.0-core.3cef9ec65caa',
      zod: '4.6.7',
    });
    expect(manifest.peerDependencies).toEqual({
      '@ogm/iframe-bridge': 'npm:@its-owner/iframe-bridge@0.0.0-core.3cef9ec65caa',
      tone: '15.1.22',
    });
    expect(manifest.peerDependenciesMeta).toEqual({ '@ogm/iframe-bridge': { optional: true } });
  });

  it('drops workspace devDependencies and keeps external ones', () => {
    const pkg = workspacePackage('/workspace/packages/contracts', contracts);
    const { manifest } = publishedManifest({ pkg, profile: github, names, versions });
    expect(manifest.devDependencies).toEqual({ 'json-schema-to-typescript': '16.0.0' });
  });

  it('refuses a package whose manifest exposes no dist directory', () => {
    const pkg = workspacePackage('/workspace/packages/plain', {
      name: '@gm/plain',
      version: '0.0.0',
      exports: { '.': './index.js' },
    });
    expect(() =>
      publishedManifest({
        pkg,
        profile: github,
        names: new Map([['@gm/plain', '@its-owner/plain']]),
        versions: new Map([['@gm/plain', '1.0.0']]),
      }),
    ).toThrow(/does not expose a dist directory/);
  });
});

describe('stagePackage', () => {
  it('copies the published surface and writes the rewritten manifest', async () => {
    const dir = await scratch();
    const pkgDir = join(dir, 'contracts');
    await mkdir(join(pkgDir, 'dist'), { recursive: true });
    await mkdir(join(pkgDir, 'bin'), { recursive: true });
    await mkdir(join(pkgDir, 'schemas'), { recursive: true });
    await mkdir(join(pkgDir, 'fixtures'), { recursive: true });
    await writeFile(join(pkgDir, 'dist/index.js'), 'export const x = 1;\n');
    await writeFile(join(pkgDir, 'bin/validate-cards.mjs'), '#!/usr/bin/env node\n');
    await writeFile(join(pkgDir, 'README.md'), '# contracts\n');
    await writeFile(join(pkgDir, 'package.json'), JSON.stringify(contracts));

    const staged = await stagePackage({
      pkg: workspacePackage(pkgDir, contracts),
      profile: github,
      names,
      versions,
      stagingRoot: join(dir, 'stage'),
    });

    const written = JSON.parse(await readFile(join(staged.dir, 'package.json'), 'utf8')) as Manifest;
    expect(written.name).toBe('@its-owner/contracts');
    expect(await readFile(join(staged.dir, 'dist/index.js'), 'utf8')).toBe('export const x = 1;\n');
    expect(await readFile(join(staged.dir, 'README.md'), 'utf8')).toBe('# contracts\n');
  });

  it('fails closed when the build output is missing', async () => {
    const dir = await scratch();
    const pkgDir = join(dir, 'sdk');
    await mkdir(pkgDir, { recursive: true });
    await writeFile(join(pkgDir, 'package.json'), JSON.stringify(sdk));
    await expect(
      stagePackage({
        pkg: workspacePackage(pkgDir, sdk),
        profile: github,
        names,
        versions,
        stagingRoot: join(dir, 'stage'),
      }),
    ).rejects.toThrow(/dist is missing — run the workspace build before publishing/);
  });
});
