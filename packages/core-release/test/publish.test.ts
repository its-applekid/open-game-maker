import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildWorkspace, type Manifest } from '../src/graph.js';
import { registryProfile } from '../src/profile.js';
import {
  describePlan,
  integrityOf,
  packumentUrl,
  planRelease,
  publishPlan,
  readPublished,
  verifyOidc,
} from '../src/publish.js';
import type { RunCommand } from '../src/run.js';

const dirs: string[] = [];

async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'core-release-publish-'));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

const SHA = '3cef9ec65caaf2dfa51649cc8befb9a916c8487b';
const npmjs = registryProfile({ scope: '@its-owner' });

const contracts: Manifest = {
  name: '@ogm/contracts',
  version: '0.0.0',
  private: true,
  type: 'module',
  exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
};
const sdk: Manifest = {
  name: '@gm/sdk',
  version: '0.0.0',
  private: true,
  type: 'module',
  exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
  dependencies: { '@ogm/contracts': 'workspace:*' },
};

/** A workspace on disk with one built dist per package. */
async function fixtureWorkspace(): Promise<{ root: string; order: string[] }> {
  const root = await scratch();
  for (const [folder, manifest] of [
    ['contracts', contracts],
    ['sdk', sdk],
  ] as const) {
    const dir = join(root, 'packages', folder);
    await mkdir(join(dir, 'dist'), { recursive: true });
    await writeFile(join(dir, 'dist/index.js'), `export const name = '${manifest.name}';\n`);
    await writeFile(join(dir, 'package.json'), JSON.stringify(manifest));
  }
  return { root, order: ['@ogm/contracts', '@gm/sdk'] };
}

/** pnpm pack is replaced: it copies a marker file into the destination and prints the tarball path. */
const packRun: RunCommand = async (file, args, options) => {
  if (file !== 'pnpm' || args[0] !== 'pack') return { code: 1, stdout: '', stderr: 'unexpected command' };
  const destination = args[args.indexOf('--pack-destination') + 1] as string;
  const manifest = JSON.parse(await readFile(join(options.cwd, 'package.json'), 'utf8')) as Manifest;
  const name = String(manifest.name).replace(/[^a-z0-9]+/gi, '-');
  const tarball = join(destination, `${name}-${String(manifest.version)}.tgz`);
  await writeFile(tarball, `${manifest.name}@${String(manifest.version)}`);
  return { code: 0, stdout: `📦  ${tarball}\n`, stderr: '' };
};

describe('integrityOf and packumentUrl', () => {
  it('reports sha512 integrity the way a registry does', () => {
    expect(integrityOf(Buffer.from('abc'))).toBe(
      'sha512-3a81oZNherrMQXNJriBBMRLm+k6JqX6iCp7u5ktV05ohkpkqJ0/BqDa6PCOj/uu9RU1EI2Q86A4qmslPpUyknw==',
    );
  });

  it('escapes the scope separator in the packument URL', () => {
    expect(packumentUrl(npmjs, '@its-owner/sdk')).toBe('https://registry.npmjs.org/@its-owner%2fsdk');
  });
});

describe('planRelease', () => {
  it('packs the closure leaves first with published names and versions', async () => {
    const { root, order } = await fixtureWorkspace();
    const workspace = buildWorkspace(
      root,
      order.map((name) => ({
        dir: join(root, 'packages', name === '@ogm/contracts' ? 'contracts' : 'sdk'),
        manifest: name === '@ogm/contracts' ? contracts : sdk,
      })),
    );
    const plan = await planRelease({
      workspace,
      order,
      profile: npmjs,
      coreSha: SHA,
      stagingRoot: join(root, 'stage'),
      outDir: join(root, 'pack'),
      run: packRun,
    });

    expect(plan.entries.map((entry) => entry.name)).toEqual(['@its-owner/contracts', '@its-owner/sdk']);
    expect(plan.entries.map((entry) => entry.version)).toEqual(['0.0.0-core.3cef9ec65caa', '0.0.0-core.3cef9ec65caa']);
    expect(plan.entries[1]?.dependencies).toEqual({
      '@ogm/contracts': 'npm:@its-owner/contracts@0.0.0-core.3cef9ec65caa',
    });
    expect(plan.entries[0]?.integrity.startsWith('sha512-')).toBe(true);
  });

  it('points the staged tarball at the core repository so npm can match the trusted publisher', async () => {
    const { root, order } = await fixtureWorkspace();
    const workspace = buildWorkspace(
      root,
      order.map((name) => ({
        dir: join(root, 'packages', name === '@ogm/contracts' ? 'contracts' : 'sdk'),
        manifest: name === '@ogm/contracts' ? contracts : sdk,
      })),
    );
    const stagingRoot = join(root, 'stage');
    await planRelease({
      workspace,
      order,
      profile: npmjs,
      coreSha: SHA,
      stagingRoot,
      outDir: join(root, 'pack'),
      run: packRun,
      repository: 'https://github.com/its-owner/open-game-maker',
    });
    const manifest = JSON.parse(await readFile(join(stagingRoot, '-ogm-contracts/package.json'), 'utf8')) as {
      repository?: { type: string; url: string };
    };
    expect(manifest.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/its-owner/open-game-maker.git',
    });
  });

  it('describes the plan without contacting the registry', () => {
    const lines = describePlan({
      coreSha: SHA,
      profile: npmjs,
      names: new Map([['@gm/sdk', '@its-owner/sdk']]),
      versions: new Map([['@gm/sdk', '0.0.0-core.3cef9ec65caa']]),
      entries: [
        {
          source: '@gm/sdk',
          name: '@its-owner/sdk',
          version: '0.0.0-core.3cef9ec65caa',
          files: ['dist'],
          dependencies: {},
          tarball: '/tmp/x.tgz',
          bytes: 12,
          integrity: 'sha512-abc',
        },
      ],
    });
    expect(lines.join('\n')).toContain('@its-owner/sdk@0.0.0-core.3cef9ec65caa (from @gm/sdk)');
    expect(lines.join('\n')).toContain('1 packages, leaves first');
  });
});

describe('publishPlan', () => {
  const plan = {
    coreSha: SHA,
    profile: npmjs,
    names: new Map([['@gm/sdk', '@its-owner/sdk']]),
    versions: new Map([['@gm/sdk', '0.0.0-core.3cef9ec65caa']]),
    entries: [
      {
        source: '@gm/sdk',
        name: '@its-owner/sdk',
        version: '0.0.0-core.3cef9ec65caa',
        files: ['dist'],
        dependencies: {},
        tarball: '/tmp/sdk.tgz',
        bytes: 12,
        integrity: 'sha512-same',
      },
    ],
  };

  const published = (integrity: string | undefined) => ({
    versions: { '0.0.0-core.3cef9ec65caa': integrity === undefined ? {} : { dist: { integrity } } },
  });

  it('skips a version the registry already holds with the same bytes', async () => {
    const run = vi.fn<RunCommand>(async () => ({ code: 0, stdout: '', stderr: '' }));
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(published('sha512-same')), { status: 200 }),
    );
    const dir = await scratch();
    const outcomes = await publishPlan({ plan, token: 'tok', run, authFile: join(dir, 'npmrc'), fetchImpl });
    expect(outcomes).toEqual([
      {
        name: '@its-owner/sdk',
        version: '0.0.0-core.3cef9ec65caa',
        action: 'skipped',
        detail: 'already published with the same bytes',
      },
    ]);
    expect(run).not.toHaveBeenCalled();
  });

  it('fails closed when the version exists with different bytes', async () => {
    const run = vi.fn<RunCommand>(async () => ({ code: 0, stdout: '', stderr: '' }));
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(published('sha512-other')), { status: 200 }),
    );
    const dir = await scratch();
    const outcomes = await publishPlan({ plan, token: 'tok', run, authFile: join(dir, 'npmrc'), fetchImpl });
    expect(outcomes[0]?.action).toBe('failed');
    expect(outcomes[0]?.detail).toContain('immutable');
  });

  it('publishes an unknown version and keeps the token out of argv', async () => {
    const calls: { args: readonly string[]; env: Readonly<Record<string, string>> }[] = [];
    const run: RunCommand = async (_file, args, options) => {
      calls.push({ args, env: options.env });
      return { code: 0, stdout: 'ok', stderr: '' };
    };
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('not found', { status: 404 }));
    const dir = await scratch();
    const outcomes = await publishPlan({ plan, token: 'tok', run, authFile: join(dir, 'npmrc'), fetchImpl });

    expect(outcomes[0]?.action).toBe('published');
    expect(calls[0]?.args).toContain('publish');
    expect(calls[0]?.args).toContain('https://registry.npmjs.org');
    expect(calls[0]?.args).toContain('public');
    expect(calls[0]?.args.join(' ')).not.toContain('tok');
    expect(calls[0]?.env.NODE_AUTH_TOKEN).toBe('tok');
    expect(calls[0]?.env.NPM_CONFIG_USERCONFIG).toBe(join(dir, 'npmrc'));
    expect(await readFile(join(dir, 'npmrc'), 'utf8')).toContain('_authToken=${NODE_AUTH_TOKEN}');
  });

  it('publishes with no token and no .npmrc when trusted publishing is used', async () => {
    const calls: { args: readonly string[]; env: Readonly<Record<string, string>> }[] = [];
    const run: RunCommand = async (_file, args, options) => {
      calls.push({ args, env: options.env });
      return { code: 0, stdout: 'ok', stderr: '' };
    };
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('not found', { status: 404 }));
    const dir = await scratch();
    const lines: string[] = [];
    const outcomes = await publishPlan({ plan, run, fetchImpl, log: (line) => lines.push(line) });

    expect(outcomes[0]?.action).toBe('published');
    expect(calls[0]?.env).toEqual({});
    expect(lines.join('\n')).toContain('OIDC trusted publishing');
    await expect(stat(join(dir, 'npmrc'))).rejects.toThrow();
  });

  it('refuses a token publish without an auth file to write it to', async () => {
    const dir = await scratch();
    await expect(publishPlan({ plan, token: 'tok', run: packRun })).rejects.toThrow(/auth file/);
    expect(dir).toBeTruthy();
  });

  it('stops consumers when a package they import fails', async () => {
    const twoEntries = {
      ...plan,
      entries: [
        plan.entries[0]!,
        {
          ...plan.entries[0]!,
          source: '@gm/consumer',
          name: '@its-owner/consumer',
          tarball: '/tmp/consumer.tgz',
          integrity: 'sha512-c',
        },
      ],
    };
    const run: RunCommand = async () => ({ code: 1, stdout: '', stderr: 'npm ERR! 403 Forbidden' });
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('not found', { status: 404 }));
    const dir = await scratch();
    const outcomes = await publishPlan({
      plan: twoEntries,
      token: 'tok',
      run,
      authFile: join(dir, 'npmrc'),
      fetchImpl,
    });
    expect(outcomes.map((outcome) => outcome.action)).toEqual(['failed', 'blocked']);
  });
});

describe('verifyOidc', () => {
  const plan = {
    coreSha: SHA,
    profile: npmjs,
    names: new Map([['@gm/sdk', '@its-owner/sdk']]),
    versions: new Map([['@gm/sdk', '0.0.0-core.3cef9ec65caa']]),
    entries: [
      {
        source: '@gm/sdk',
        name: '@its-owner/sdk',
        version: '0.0.0-core.3cef9ec65caa',
        files: ['dist'],
        dependencies: {},
        tarball: '/tmp/sdk.tgz',
        bytes: 12,
        integrity: 'sha512-same',
      },
    ],
  };

  const withOutput =
    (stdout: string): RunCommand =>
    async () => ({ code: 0, stdout, stderr: '' });

  it('passes when the dry-run publish exchanged an OIDC token', async () => {
    const checks = await verifyOidc({
      plan,
      run: withOutput('npm verb oidc Successfully retrieved and set token\nnpm notice 📦  @its-owner/sdk@0.0.0'),
    });
    expect(checks).toEqual([
      { name: '@its-owner/sdk', version: '0.0.0-core.3cef9ec65caa', ok: true, detail: 'the OIDC exchange succeeded' },
    ]);
  });

  it('fails when the exchange was refused, even though npm publish --dry-run exits 0', async () => {
    const checks = await verifyOidc({
      plan,
      run: withOutput(
        'npm verb oidc Failed token exchange request with body message: not authorized\n' +
          'npm verb oidc Skipped because no id_token available',
      ),
    });
    expect(checks[0]?.ok).toBe(false);
    expect(checks[0]?.detail).toBe('the OIDC token exchange failed');
  });

  it('fails when no exchange was attempted at all', async () => {
    const checks = await verifyOidc({ plan, run: withOutput('npm notice 📦  @its-owner/sdk@0.0.0') });
    expect(checks[0]?.ok).toBe(false);
    expect(checks[0]?.detail).toContain('no OIDC exchange was attempted');
  });

  it('publishes nothing: every call is a --dry-run', async () => {
    const calls: string[][] = [];
    const run: RunCommand = async (_file, args) => {
      calls.push([...args]);
      return { code: 0, stdout: 'npm verb oidc Successfully retrieved and set token', stderr: '' };
    };
    await verifyOidc({ plan, run });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('--dry-run');
    expect(calls[0]).toContain('--loglevel');
    expect(calls[0]?.join(' ')).not.toContain('--apply');
  });
});

describe('readPublished', () => {
  it('treats a 404 as "nothing published yet"', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('not found', { status: 404 }));
    expect(await readPublished({ profile: npmjs, name: '@its-owner/sdk', token: 'tok', fetchImpl })).toEqual({});
  });

  it('reads a public package without a token', async () => {
    const seen: HeadersInit[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      seen.push(init?.headers ?? {});
      return new Response('not found', { status: 404 });
    });
    await readPublished({ profile: npmjs, name: '@its-owner/sdk', fetchImpl });
    expect(seen[0]).toEqual({ accept: 'application/json' });
  });

  it('refuses to guess when the registry answers with an error', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('nope', { status: 500 }));
    await expect(readPublished({ profile: npmjs, name: '@its-owner/sdk', token: 'tok', fetchImpl })).rejects.toThrow(
      /HTTP 500/,
    );
  });
});
