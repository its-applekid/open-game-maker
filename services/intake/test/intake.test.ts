import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { pollIntake, type ImportRunner } from '../src/main.js';

const temporary: string[] = [];

async function fresh(): Promise<{ assets: string; state: string }> {
  const root = await mkdtemp(join(process.env.TMPDIR ?? '/tmp', 'ogm-intake-'));
  temporary.push(root);
  const assets = join(root, 'assets');
  const state = join(root, 'state');
  await mkdir(join(assets, 'inbox', 'quarantine'), { recursive: true });
  return { assets, state };
}

type FixtureOptions = {
  dropId: string;
  directory: string;
  name: string;
  integrity?: boolean;
  md5?: string;
  license?: string;
};

async function fixture(assets: string, options: FixtureOptions): Promise<Record<string, unknown>> {
  const directory = join(assets, 'inbox', 'quarantine', options.directory);
  await mkdir(join(directory, 'files'), { recursive: true });
  await writeFile(join(directory, 'files', 'asset.dat'), 'fixture');
  if (options.license) await writeFile(join(directory, 'files', 'License.txt'), options.license);
  const manifest = {
    schema: 'ogm-drive-drop/1',
    drop_id: options.dropId,
    name: options.name,
    revision: 1,
    downloaded_at: '2026-10-26T10:00:00Z',
    quarantine: `quarantine/${options.directory}`,
    files_root: `quarantine/${options.directory}/files`,
    files: [{ path: 'asset.dat', md5: options.md5 ?? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', downloaded: true }],
    license_files: options.license ? ['License.txt'] : [],
    integrity_ok: options.integrity ?? true,
    problems: options.integrity === false ? ['checksum mismatch'] : [],
    usage_rights: {
      uses: ['vision-input'],
      audience: 'private',
      redistribution: 'none',
      attribution: null,
      basis: 'unknown',
      confirmed_by: null,
    },
  };
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
  return {
    queued_at: '2026-10-26T10:01:00Z',
    drop_id: options.dropId,
    name: options.name,
    revision: 1,
    manifest: `quarantine/${options.directory}/manifest.json`,
    integrity_ok: options.integrity ?? true,
  };
}

async function json(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('intake poller', () => {
  it('blocks bad drops, imports known licenses, awaits unknown licenses, and deduplicates', async () => {
    const { assets, state } = await fresh();
    const entries = [
      await fixture(assets, { dropId: 'BAD-DROP', directory: 'bad', name: 'Broken', integrity: false }),
      await fixture(assets, {
        dropId: 'KENNEY-DROP',
        directory: 'kenney',
        name: 'Kenney Tiny Dungeon',
        license: 'Kenney assets are licensed CC0 1.0.',
      }),
      await fixture(assets, { dropId: 'UNKNOWN-DROP', directory: 'unknown', name: 'Mystery Pack' }),
      await fixture(assets, {
        dropId: 'KENNEY-DROP',
        directory: 'kenney-copy',
        name: 'Kenney Tiny Dungeon copy',
        license: 'Kenney assets are licensed CC0 1.0.',
      }),
    ];
    await writeFile(
      join(assets, 'inbox', 'queue.jsonl'),
      `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
    );
    const run = vi.fn<ImportRunner>(async ({ args, id }) => ({
      collection: `t1:${id}@2026-10-26-r1`,
      status: args.includes('--license') ? 'imported' : 'awaiting-license',
      license: args.includes('--license') ? 'CC0-1.0' : null,
      confirmed_by: args.includes('--license') ? 'kevin' : null,
    }));
    const events: string[] = [];

    const result = await pollIntake({ assetsRoot: assets, stateDir: state, run, emit: (name) => events.push(name) });

    expect(result.hadError).toBe(false);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0]?.[0].nice).toEqual(['-n', '10']);
    expect(run.mock.calls[0]?.[0].args).toContain('CC0-1.0');
    expect(await json(join(assets, 'inbox', 'quarantine', 'bad', 'intake.json'))).toEqual({
      status: 'blocked',
      reason: 'checksum mismatch',
    });
    expect(await json(join(assets, 'inbox', 'quarantine', 'kenney', 'intake.json'))).toMatchObject({
      status: 'imported',
      license: 'CC0-1.0',
      confirmed_by: 'kevin',
    });
    expect(await json(join(assets, 'inbox', 'quarantine', 'unknown', 'intake.json'))).toMatchObject({
      status: 'awaiting-license',
      license: null,
      confirmed_by: null,
    });
    expect(await json(join(assets, 'inbox', 'quarantine', 'kenney-copy', 'intake.json'))).toMatchObject({
      status: 'duplicate',
    });
    const status = await json(join(state, 'intake', 'status.json'));
    expect(status.counts).toEqual({ blocked: 1, duplicate: 1, imported: 1, 'awaiting-license': 1 });
    expect(status.done).toHaveLength(4);
    expect(status).toMatchObject({ open: 0, last_error: null });
    expect(events).toEqual(['intake.blocked', 'intake.imported', 'intake.awaiting-license', 'intake.duplicate']);
  });

  it('does not grant a known licence through symlinked licence evidence', async () => {
    // A drop could otherwise point its licence file at any readable CC0 text and be auto-imported without a human.
    const { assets, state } = await fresh();
    const entry = await fixture(assets, { dropId: 'LINK-DROP', directory: 'link', name: 'Kenney Lookalike' });
    const outside = join(assets, 'outside-license.txt');
    await writeFile(outside, 'Kenney assets are licensed CC0 1.0.');
    await symlink(outside, join(assets, 'inbox', 'quarantine', 'link', 'files', 'License.txt'));
    const manifestPath = join(assets, 'inbox', 'quarantine', 'link', 'manifest.json');
    await writeFile(manifestPath, JSON.stringify({ ...(await json(manifestPath)), license_files: ['License.txt'] }));
    await writeFile(join(assets, 'inbox', 'queue.jsonl'), `${JSON.stringify(entry)}\n`);
    const run = vi.fn<ImportRunner>().mockResolvedValue({
      collection: 't1:drive-kenney-lookalike@2026-10-26-r1',
      status: 'awaiting-license',
      license: null,
    });

    await pollIntake({ assetsRoot: assets, stateDir: state, run, emit: () => undefined });

    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]?.[0].args).not.toContain('--license');
  });

  it('keeps importing past a bad queue line and gives same-named drops their own packs', async () => {
    // One corrupt line must not stall every later drop, and two Drive drops named alike must not share a pack id.
    const { assets, state } = await fresh();
    const first = await fixture(assets, {
      dropId: 'DROP-AAAAAAAA',
      directory: 'one',
      name: 'Props',
      md5: 'a'.repeat(32),
    });
    const second = await fixture(assets, {
      dropId: 'DROP-BBBBBBBB',
      directory: 'two',
      name: 'Props',
      md5: 'b'.repeat(32),
    });
    const partial = JSON.stringify(first).slice(0, 20);
    await writeFile(
      join(assets, 'inbox', 'queue.jsonl'),
      `{not json\n${JSON.stringify(first)}\n${JSON.stringify(second)}\n${partial}`,
    );
    const run = vi.fn<ImportRunner>(async ({ id }) => ({
      collection: `t1:${id}@2026-10-26-r1`,
      status: 'awaiting-license',
      license: null,
    }));
    const events: string[] = [];

    const result = await pollIntake({ assetsRoot: assets, stateDir: state, run, emit: (name) => events.push(name) });

    expect(result.hadError).toBe(false);
    expect(run).toHaveBeenCalledTimes(2);
    const ids = run.mock.calls.map(([call]) => call.id);
    expect(new Set(ids).size).toBe(2);
    expect(events.filter((name) => name === 'intake.error')).toHaveLength(1);
    expect(await json(join(state, 'intake', 'status.json'))).toMatchObject({
      last_error: expect.stringContaining('queue line 1'),
    });
  });

  it('leaves failed imports open and retries them on the next poll', async () => {
    const { assets, state } = await fresh();
    const entry = await fixture(assets, { dropId: 'RETRY-DROP', directory: 'retry', name: 'Retry Me' });
    await writeFile(join(assets, 'inbox', 'queue.jsonl'), `${JSON.stringify(entry)}\n`);
    const failing = vi.fn<ImportRunner>().mockRejectedValue(new Error('gm exited 2'));

    const first = await pollIntake({ assetsRoot: assets, stateDir: state, run: failing, emit: () => undefined });

    expect(first.hadError).toBe(true);
    await expect(stat(join(assets, 'inbox', 'quarantine', 'retry', 'intake.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(await json(join(state, 'intake', 'status.json'))).toMatchObject({
      open: 1,
      last_error: 'RETRY-DROP: gm exited 2',
    });

    const succeeding = vi.fn<ImportRunner>().mockResolvedValue({
      collection: 't1:drive-retry-me@2026-10-26-r1',
      status: 'awaiting-license',
      license: null,
    });
    const second = await pollIntake({ assetsRoot: assets, stateDir: state, run: succeeding, emit: () => undefined });
    expect(second.hadError).toBe(false);
    expect(succeeding).toHaveBeenCalledOnce();
    expect(await json(join(assets, 'inbox', 'quarantine', 'retry', 'intake.json'))).toMatchObject({
      status: 'awaiting-license',
    });
  });
});
