import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { schema } from '@ogm/db';
import { describe, expect, it } from 'vitest';

import { finishRun, publishStaged, sweepBuilds } from '../../src/builds/publish.js';
import { BadArchive, untarGz } from '../../src/builds/untar.js';
import { tarGz } from '../../src/internal/tarball.js';
import { builtFiles, completeRun, gamesHost, ids, jobState, SECRET, SHA, TICKET, world } from './fixtures.js';

const archiveOf = (dir: string) => execFileSync('tar', ['--format=ustar', '-czf', '-', '-C', dir, '.']);

function upload(app: ReturnType<typeof world>['app'], body: Buffer, headers: Record<string, string> = {}) {
  return app.request(`http://127.0.0.1:4000/internal/jobs/by-ticket/${TICKET}/build`, {
    method: 'POST',
    headers: { authorization: `Bearer ${SECRET}`, 'x-gm-sha': SHA, 'content-type': 'application/gzip', ...headers },
    body,
  });
}

function builds(deps: ReturnType<typeof world>['deps']) {
  return deps.db.select().from(schema.builds).all();
}

function latestBuildId(deps: ReturnType<typeof world>['deps']) {
  return deps.sqlite
    .prepare<[string], { latest_build_id: string | null }>('SELECT latest_build_id FROM branches WHERE id = ?')
    .get(ids.main)?.latest_build_id;
}

describe('publishing a merged build', () => {
  it('serves the build, marks it tested and points the branch at it when the upload follows the merge', async () => {
    const { deps, app } = world();
    completeRun(deps);

    const response = await upload(app, archiveOf(builtFiles()));
    expect(response.status).toBe(201);
    const { buildId } = (await response.json()) as { buildId: string };

    const [build] = builds(deps);
    expect(build).toMatchObject({ id: buildId, jobId: ids.job, gitSha: SHA, status: 'tested', sdkVersion: '^1.0.0' });
    expect(build!.artifactPath).toBe(join(deps.config.gamesRoot, ids.game, buildId));
    expect(latestBuildId(deps)).toBe(buildId);
    expect(jobState(deps)).toBe('done');
    // Draft reads the branch's design log: its head is the switch to this build.
    const head = deps.sqlite
      .prepare<[string], { base_build_id: string }>(
        'SELECT base_build_id FROM design_transactions WHERE branch_id = ? ORDER BY rev DESC LIMIT 1',
      )
      .get(ids.main);
    expect(head?.base_build_id).toBe(buildId);

    const host = await gamesHost(deps.config.gamesRoot);
    try {
      const page = await fetch(`${host.base}/g/${ids.game}/${buildId}/`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('<title>Fixture</title>');
      expect((await fetch(`${host.base}/g/${ids.game}/${buildId}/assets/main.js`)).status).toBe(200);
    } finally {
      await host.close();
    }
  });

  it('stages an upload that lands before the merge and publishes it when the run completes', async () => {
    const { deps, app } = world();

    const response = await upload(app, archiveOf(builtFiles()));
    expect(response.status).toBe(202);
    expect(builds(deps)).toEqual([]);
    expect(existsSync(join(deps.config.gamesRoot, ids.game))).toBe(false);
    expect(jobState(deps)).toBe('running');

    // What main.ts does when the feed reports the run completed.
    const outcome = await publishStaged(deps, ids.job);
    expect(outcome).toMatchObject({ state: 'done' });
    expect(jobState(deps)).toBe('done');
    expect(readdirSync(join(deps.config.gamesRoot, '.staging'))).toEqual([]);
  });

  it('fails the job with the reason and leaves nothing complete when the build has no manifest', async () => {
    const { deps, app } = world();
    completeRun(deps);

    const response = await upload(app, archiveOf(builtFiles(undefined, { manifest: false, design: true })));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ state: 'failed', reason: 'manifest_invalid' });
    expect(jobState(deps)).toBe('failed');
    expect(existsSync(join(deps.config.gamesRoot, ids.game))).toBe(false);
    expect(deps.lines).toContainEqual(
      expect.objectContaining({ event: 'build_publish_failed', reason: 'manifest_invalid' }),
    );
  });

  it('refuses an archive carrying a link without touching the job', async () => {
    const { deps, app } = world();
    completeRun(deps);
    const dir = builtFiles();
    symlinkSync('/etc/hostname', join(dir, 'leak.txt'));

    const response = await upload(app, archiveOf(dir));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: { code: 'archive_unsupported_entry' } });
    expect(jobState(deps)).toBe('running');
    expect(builds(deps)).toEqual([]);
  });

  it('accepts uploads only from the daemon that owns a build job still awaiting its build', async () => {
    const body = archiveOf(builtFiles());
    expect((await upload(world().app, body, { authorization: 'Bearer wrong' })).status).toBe(401);
    expect((await upload(world().app, body, { 'x-gm-sha': 'HEAD' })).status).toBe(400);
    expect((await upload(world('scope').app, body)).status).toBe(409);

    const { deps, app } = world();
    deps.db.update(schema.jobs).set({ state: 'cancelled' }).run();
    expect((await upload(app, body)).status).toBe(409);
  });
});

describe('publish rollback', () => {
  it('removes the build and fails the job when the branch switch is refused', async () => {
    const { deps, app } = world();
    completeRun(deps);
    deps.sqlite.prepare("UPDATE branches SET status = 'archived' WHERE id = ?").run(ids.main);

    const response = await upload(app, archiveOf(builtFiles()));
    expect(response.status).toBe(422);
    expect(jobState(deps)).toBe('failed');
    expect(builds(deps)).toEqual([expect.objectContaining({ status: 'failed' })]);
    expect(readdirSync(join(deps.config.gamesRoot, ids.game))).toEqual([]);
    expect(latestBuildId(deps)).toBeNull();
  });
});

describe('finishRun', () => {
  it('ends a build job the feed reports cancelled', () => {
    const { deps } = world();
    finishRun(deps, ids.job, 'cancelled');
    expect(jobState(deps)).toBe('cancelled');
  });

  it('keeps a build job open when its run completes before a build arrives', () => {
    const { deps } = world();
    finishRun(deps, ids.job, 'done');
    expect(jobState(deps)).toBe('running');
  });

  it('finishes a scope job, which ships no build, as soon as its run completes', () => {
    const { deps } = world('scope');
    finishRun(deps, ids.job, 'done');
    expect(jobState(deps)).toBe('done');
  });

  it('publishes a build staged before the run completed', async () => {
    const { deps, app } = world();
    expect((await upload(app, archiveOf(builtFiles()))).status).toBe(202);
    finishRun(deps, ids.job, 'done');
    await expect.poll(() => jobState(deps)).toBe('done');
    expect(builds(deps)).toEqual([expect.objectContaining({ jobId: ids.job, status: 'tested' })]);
    // Let the background publish release its claim before the next test reuses the job id.
    await expect.poll(() => existsSync(join(deps.config.gamesRoot, '.staging', ids.job))).toBe(false);
  });
});

describe('sweepBuilds', () => {
  const graceMs = 30 * 60_000;

  it('fails a build job whose merged run never delivered a build within the grace period', async () => {
    const { deps } = world();
    completeRun(deps);

    await sweepBuilds(deps, graceMs, new Date('2026-11-01T21:00:00.000Z'));
    // Pollers keep refreshing the projection row; the grace must still run from when the completion was seen.
    completeRun(deps, '2026-11-01T21:29:00.000Z');
    await sweepBuilds(deps, graceMs, new Date('2026-11-01T21:20:00.000Z'));
    expect(jobState(deps)).toBe('running');

    await sweepBuilds(deps, graceMs, new Date('2026-11-01T21:31:00.000Z'));
    expect(jobState(deps)).toBe('failed');
    expect(deps.lines).toContainEqual(
      expect.objectContaining({ event: 'build_publish_failed', jobId: ids.job, reason: 'build_not_received' }),
    );
  });

  it('publishes a staged build whose completion the feed handed over before routes were ready', async () => {
    const { deps, app } = world();
    expect((await upload(app, archiveOf(builtFiles()))).status).toBe(202);
    completeRun(deps);

    await sweepBuilds(deps, graceMs);
    expect(jobState(deps)).toBe('done');
    expect(builds(deps)).toEqual([expect.objectContaining({ status: 'tested' })]);
  });

  it('drops a staged build of a job that ended without a merge', async () => {
    const { deps, app } = world();
    expect((await upload(app, archiveOf(builtFiles()))).status).toBe(202);
    deps.db.update(schema.jobs).set({ state: 'cancelled' }).run();

    await sweepBuilds(deps, graceMs);
    expect(readdirSync(join(deps.config.gamesRoot, '.staging'))).toEqual([]);
  });
});

describe('untarGz', () => {
  const target = () => join(mkdtempSync(join(tmpdir(), 'ogm-untar-')), 'out');

  it.each(['../escape.txt', '/etc/escape.txt', 'a/../../escape.txt'])('refuses the path %s', async (path) => {
    await expect(untarGz(tarGz([{ path, content: 'x' }]), target())).rejects.toThrow(BadArchive);
  });

  it('refuses an archive over the size limit', async () => {
    const archive = tarGz([{ path: 'big.bin', content: 'x'.repeat(4096) }]);
    const limits = { compressedBytes: 1 << 20, unpackedBytes: 1024, entries: 10 };
    await expect(untarGz(archive, target(), limits)).rejects.toThrow('archive_too_large');
  });
});
