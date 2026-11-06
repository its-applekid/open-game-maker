import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { diagnose } from '../src/diagnose.js';
import { registryProfile } from '../src/profile.js';
import { coreReleaseSetText } from '../src/release-set.js';
import { applySwitch, planSwitch } from '../src/switch.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures', 'instance-vendored');
const SHA = '3cef9ec65caaf2dfa51649cc8befb9a916c8487b';
const npmjs = registryProfile({ scope: '@its-owner' });
const destination = { registry: npmjs.registry, scope: npmjs.scope };

const versions = new Map([
  ['@ogm/contracts', '0.0.0-core.3cef9ec65caa'],
  ['@gm/sdk', '0.0.0-core.3cef9ec65caa'],
  ['@gm/pack-kaykit', '0.0.0-core.3cef9ec65caa'],
]);

const dirs: string[] = [];

afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function instanceRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'core-release-diagnose-'));
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

/** The instance repository after the switch: registry specifiers and a release set. */
async function switchedRepo(): Promise<string> {
  const dir = await instanceRepo();
  await applySwitch(await planSwitch({ dir, profile: npmjs, versions, coreSha: SHA }));
  return dir;
}

function codes(findings: readonly { code: string }[]): string[] {
  return findings.map((finding) => finding.code).sort();
}

describe('diagnose', () => {
  it('reports every legacy local specifier before a switch', async () => {
    const dir = await instanceRepo();
    const diagnosis = await diagnose({ dir, destination });

    expect(diagnosis.pin).toBe(SHA);
    expect(diagnosis.set).toBeNull();
    expect(codes(diagnosis.findings)).toEqual([
      'legacy-specifier',
      'legacy-specifier',
      'legacy-specifier',
      'legacy-specifier',
      'offline-enabled',
      'registry-not-configured',
      'set-missing',
    ]);
    const sdk = diagnosis.findings.find(
      (finding) => finding.code === 'legacy-specifier' && finding.detail.startsWith('@gm/sdk'),
    );
    expect(sdk).toMatchObject({ severity: 'error', path: 'games/example-2d/package.json' });
    expect(sdk?.detail).toContain('file:../../vendor/gm-sdk-3cef9ec65caa.tgz');
  });

  it('is clean after the switch', async () => {
    const dir = await switchedRepo();
    const diagnosis = await diagnose({ dir, destination });
    expect(diagnosis.findings).toEqual([]);
    expect(diagnosis.checked).toContain(`vendor/core.json pins ${SHA.slice(0, 12)}`);
    expect(diagnosis.checked).toContain('vendor/core-packages.json holds 3 specifiers');
  });

  it('reports a release set that came from another commit as stale', async () => {
    const dir = await switchedRepo();
    const setPath = join(dir, 'vendor', 'core-packages.json');
    const set = JSON.parse(await readFile(setPath, 'utf8')) as { core: { sha: string } };
    set.core.sha = 'a'.repeat(40);
    await writeFile(setPath, `${JSON.stringify(set, null, 2)}\n`);

    const diagnosis = await diagnose({ dir, destination });
    expect(codes(diagnosis.findings)).toEqual(['set-stale']);
    expect(diagnosis.findings[0]?.detail).toContain(
      `came from aaaaaaaaaaaa but the repository pins ${SHA.slice(0, 12)}`,
    );
  });

  it('reports a specifier that drifted from the release set', async () => {
    const dir = await switchedRepo();
    const manifestPath = join(dir, 'games/example-2d/package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { dependencies: Record<string, string> };
    manifest.dependencies['@gm/sdk'] = 'npm:@its-owner/sdk@0.0.0-core.111111111111';
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const diagnosis = await diagnose({ dir, destination });
    expect(codes(diagnosis.findings)).toEqual(['version-drift']);
    expect(diagnosis.findings[0]?.detail).toContain('0.0.0-core.111111111111');
  });

  it('reports a core dependency the set does not list', async () => {
    const dir = await switchedRepo();
    const manifestPath = join(dir, 'games/example-2d/package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { dependencies: Record<string, string> };
    manifest.dependencies['@gm/iframe-bridge'] = 'npm:@its-owner/iframe-bridge@0.0.0-core.3cef9ec65caa';
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const diagnosis = await diagnose({ dir, destination });
    expect(codes(diagnosis.findings)).toEqual(['core-not-released']);
  });

  it('reports a tarball nothing points at as a warning', async () => {
    const dir = await switchedRepo();
    await writeFile(join(dir, 'vendor', 'gm-sdk-old.tgz'), 'stale tarball\n');

    const diagnosis = await diagnose({ dir, destination });
    expect(diagnosis.findings).toEqual([
      {
        code: 'orphan-tarball',
        severity: 'warning',
        path: 'vendor/gm-sdk-old.tgz',
        detail: 'no manifest references this tarball any more',
        fix: 'delete it; core-release switch --apply removes what it switches',
      },
    ]);
  });

  it('reports offline=true and a missing registry block in .npmrc', async () => {
    const dir = await switchedRepo();
    await writeFile(join(dir, '.npmrc'), 'store-dir=${HOME}/.local/share/ogm/pnpm-store\noffline=true\n');

    const diagnosis = await diagnose({ dir, destination });
    expect(codes(diagnosis.findings)).toEqual(['offline-enabled', 'registry-not-configured']);
  });

  it('reports a lockfile without the released version or its integrity as warnings', async () => {
    const dir = await switchedRepo();
    await writeFile(join(dir, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n\nimporters:\n  games/example-2d: {}\n");
    const missing = await diagnose({ dir, destination });
    expect(missing.findings.filter((finding) => finding.code === 'lockfile-stale')).toHaveLength(3);
    expect(missing.findings.every((finding) => finding.severity === 'warning')).toBe(true);

    await writeFile(
      join(dir, 'pnpm-lock.yaml'),
      [
        "lockfileVersion: '9.0'",
        '',
        'packages:',
        '',
        "  '@its-owner/sdk@0.0.0-core.3cef9ec65caa':",
        '    resolution: {integrity: sha512-abc}',
        "  '@its-owner/contracts@0.0.0-core.3cef9ec65caa':",
        '    resolution: {integrity: sha512-abc}',
        "  '@its-owner/pack-kaykit@0.0.0-core.3cef9ec65caa':",
        '    resolution: {integrity: sha512-abc}',
        '',
      ].join('\n'),
    );
    const complete = await diagnose({ dir, destination });
    expect(complete.findings).toEqual([]);
  });

  it('proves each version is published when asked to go online', async () => {
    const dir = await switchedRepo();
    const asked: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      asked.push(String(url));
      const name = decodeURIComponent(String(url).split('/').pop() ?? '');
      const version = '0.0.0-core.3cef9ec65caa';
      if (name.endsWith('pack-kaykit')) {
        return new Response(JSON.stringify({ name, versions: {} }), { status: 200 });
      }
      return new Response(JSON.stringify({ name, versions: { [version]: { name, version } } }), { status: 200 });
    }) as unknown as typeof fetch;

    const diagnosis = await diagnose({ dir, destination, online: true, fetchImpl });
    expect(asked).toEqual([
      'https://registry.npmjs.org/@its-owner%2fpack-kaykit',
      'https://registry.npmjs.org/@its-owner%2fsdk',
      'https://registry.npmjs.org/@its-owner%2fcontracts',
    ]);
    expect(codes(diagnosis.findings)).toEqual(['version-not-published']);
    expect(diagnosis.findings[0]?.detail).toContain('does not list this version');
    expect(diagnosis.checked).toContain('@its-owner/sdk@0.0.0-core.3cef9ec65caa is published');
  });

  it('treats an unreachable registry as a finding, not as published', async () => {
    const dir = await switchedRepo();
    const fetchImpl = (async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }) as unknown as typeof fetch;
    const diagnosis = await diagnose({ dir, destination, online: true, fetchImpl });
    expect(diagnosis.findings).toHaveLength(3);
    expect(diagnosis.findings[0]?.detail).toContain('could not be read');
  });

  it('reports a manifest it cannot read as a finding instead of throwing', async () => {
    const dir = await switchedRepo();
    await writeFile(join(dir, 'games/example-2d/package.json'), '{ not json\n');

    const diagnosis = await diagnose({ dir, destination });
    expect(codes(diagnosis.findings)).toContain('manifest-invalid');
    expect(diagnosis.findings.find((finding) => finding.code === 'manifest-invalid')).toMatchObject({
      severity: 'error',
      path: 'games/example-2d/package.json',
    });
  });

  it('does not call a tarball orphaned when a manifest names it relative to its own directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'core-release-diagnose-relative-'));
    dirs.push(dir);
    await mkdir(join(dir, 'vendor'), { recursive: true });
    await writeFile(join(dir, 'vendor', 'gm-sdk-3cef9ec65caa.tgz'), 'vendored tarball placeholder\n');
    await writeFile(
      join(dir, 'vendor', 'core-packages.json'),
      coreReleaseSetText({ sha: SHA, profile: npmjs, versions }),
    );
    await writeFile(
      join(dir, 'package.json'),
      `${JSON.stringify(
        {
          name: 'standalone-game',
          dependencies: { '@gm/sdk': 'file:./vendor/gm-sdk-3cef9ec65caa.tgz' },
        },
        null,
        2,
      )}\n`,
    );

    const diagnosis = await diagnose({ dir, destination });
    expect(codes(diagnosis.findings)).not.toContain('orphan-tarball');
    expect(codes(diagnosis.findings)).toContain('legacy-specifier');
  });

  it('warns when a standalone repository records no pin', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'core-release-diagnose-standalone-'));
    dirs.push(dir);
    await writeFile(
      join(dir, 'package.json'),
      `${JSON.stringify(
        {
          name: 'standalone-game',
          dependencies: { '@gm/sdk': 'npm:@its-owner/sdk@0.0.0-core.3cef9ec65caa' },
        },
        null,
        2,
      )}\n`,
    );
    await mkdir(join(dir, 'vendor'), { recursive: true });
    await writeFile(
      join(dir, 'vendor', 'core-packages.json'),
      coreReleaseSetText({ sha: SHA, profile: npmjs, versions }),
    );

    const diagnosis = await diagnose({ dir, destination });
    expect(codes(diagnosis.findings)).toEqual(['pin-missing', 'registry-not-configured']);
  });
});
