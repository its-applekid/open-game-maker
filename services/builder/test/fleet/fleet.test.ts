import { lstat, readFile, readlink, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';

import { renderDaemonFiles } from '@ogm/game-repo-template';

import { IDLE_STOP_MS } from '../../src/fleet/fleet.js';
import { READY_TIMEOUT_MS, START_POLL_MS } from '../../src/fleet/health.js';
import { preflight as realPreflight } from '../../src/policy/preflight.js';
import { buildFleet, cleanupHomes, fakeFetch, liveRow, memoryStore, systemctlCalls, tempHome } from './helpers.js';

afterEach(cleanupHomes);

const repo = 'everdred-games/castle_run';
const slug = 'everdred-games-castle-run';
const okPreflight = async () => ({ ok: true as const });

async function mode(path: string): Promise<number> {
  return (await stat(path)).mode & 0o777;
}

describe('ensureDaemon', () => {
  it('renders the directory, writes 0600 secrets, mints two tokens, starts the unit and polls health to running', async () => {
    const home = await tempHome();
    const preflight = vi.fn(async () => ({ ok: true as const }));
    const { fleet, store, runner, fetch, sleeps } = buildFleet(home, { fetch: fakeFetch([503, 503, 200]), preflight });

    const result = await fleet.ensureDaemon(repo, 'feature');

    expect(result).toMatchObject({ status: 'running', daemon: { port: 4101, clientToken: 'aiur_token1' } });
    const dir = join(home, '.local/share/ogm/daemons', slug);
    const config = parse(await readFile(join(dir, '.aiur/config'), 'utf8'));
    expect(config.tracker.github.repo).toBe(repo);
    expect(config.server).toMatchObject({ host: '127.0.0.1', port: 4101 });
    expect(config.instance.id).toBe(slug);
    expect(await readFile(join(dir, '.aiur/hooks'), 'utf8')).toBe(renderDaemonFiles().hooks);
    expect(await readFile(join(dir, '.aiur/prompt.md'), 'utf8')).toBe(renderDaemonFiles().prompt);
    expect((await stat(join(dir, 'workspaces'))).isDirectory()).toBe(true);

    const envFile = join(home, '.config/ogm/env', `ogm-aiur@${slug}.env`);
    expect(await mode(envFile)).toBe(0o600);
    for (const name of ['client-token', 'read-token', 'hook-secret']) {
      expect(await mode(join(home, '.config/ogm/daemons', slug, name))).toBe(0o600);
    }
    expect((await readFile(join(home, '.config/ogm/daemons', slug, 'read-token'), 'utf8')).trim()).toBe('aiur_token2');

    expect(preflight).toHaveBeenCalledWith(dir, expect.objectContaining({ repo, port: 4101 }));
    const tokenCalls = runner.calls.filter((call) => call.args[0] === 'token' && call.args[1] === 'create');
    expect(tokenCalls.map((call) => [call.args.slice(2), call.cwd])).toEqual([
      [['ogm-api', '--scope', 'write'], dir],
      [['operator', '--scope', 'read'], dir],
    ]);
    expect(systemctlCalls(runner)).toEqual([`--user start ogm-aiur@${slug}.service`]);
    expect(fetch.urls).toEqual(Array(3).fill('http://127.0.0.1:4101/healthz'));
    expect(sleeps).toEqual([START_POLL_MS, START_POLL_MS]);
    expect(store.rows.get(slug)?.status).toBe('running');
    expect(JSON.stringify([...store.rows.values()])).not.toContain('aiur_token');
  });

  it('starts nothing when preflight fails and stores the reasons on the row', async () => {
    const home = await tempHome();
    const preflight = async () => ({ ok: false as const, reasons: ['config drift: agent.codex'] });
    const { fleet, store, runner } = buildFleet(home, { preflight });

    const result = await fleet.ensureDaemon(repo, 'feature');

    expect(result).toEqual({ status: 'stopped', reasons: ['config drift: agent.codex'] });
    expect(systemctlCalls(runner)).toEqual([]);
    expect(runner.calls).toEqual([]);
    expect(store.rows.get(slug)).toMatchObject({ status: 'stopped', lastError: 'config drift: agent.codex' });
  });

  it('runs the real preflight against the rendered files', async () => {
    const home = await tempHome();
    const { fleet } = buildFleet(home);

    await expect(fleet.ensureDaemon(repo, 'feature')).resolves.toMatchObject({ status: 'running' });
  });

  it('isolates daemon Codex homes and refreshes every live profile when membership changes', async () => {
    const home = await tempHome();
    const preflight = vi.fn(realPreflight);
    const { fleet, store, runner } = buildFleet(home, {
      preflight,
      jobs: { 'owner/alpha': ['feature'], 'owner/charlie': ['feature'] },
    });
    const repos = ['owner/alpha', 'owner/bravo', 'owner/charlie'];

    for (const gameRepo of repos) {
      await expect(fleet.ensureDaemon(gameRepo, 'feature')).resolves.toMatchObject({ status: 'running' });
    }

    const sharedAuth = join(home, '.config/ogm/codex-gamebuilder/auth.json');
    for (const game of ['owner-alpha', 'owner-bravo', 'owner-charlie']) {
      const codexHome = join(home, '.config/ogm/codex', game);
      const profile = await readFile(join(codexHome, 'config.toml'), 'utf8');
      const daemonDir = join(home, '.local/share/ogm/daemons', game);
      const config = parse(await readFile(join(daemonDir, '.aiur/config'), 'utf8'));
      const envFile = await readFile(join(home, '.config/ogm/env', `ogm-aiur@${game}.env`), 'utf8');

      expect(config.agent.accounts.codex).toEqual([]);
      expect(envFile).toContain(`CODEX_HOME=${codexHome}\n`);
      expect((await lstat(join(codexHome, 'auth.json'))).isSymbolicLink()).toBe(true);
      expect(await readlink(join(codexHome, 'auth.json'))).toBe(sharedAuth);
      for (const other of ['owner-alpha', 'owner-bravo', 'owner-charlie'].filter((slug) => slug !== game)) {
        expect(profile).toContain(join(home, '.local/share/ogm/daemons', other, 'workspaces'));
      }
    }

    expect(preflight).toHaveBeenCalledTimes(6);
    expect(new Set(preflight.mock.calls.slice(-3).map(([daemonDir]) => daemonDir))).toEqual(
      new Set(
        ['owner-alpha', 'owner-bravo', 'owner-charlie'].map((game) => join(home, '.local/share/ogm/daemons', game)),
      ),
    );

    await store.update('owner-bravo', {
      status: 'idle',
      idleSince: new Date(Date.now() - IDLE_STOP_MS).toISOString(),
    });
    await expect(fleet.stopIdleDaemons()).resolves.toEqual(['owner-bravo']);

    expect(preflight).toHaveBeenCalledTimes(8);
    expect(new Set(preflight.mock.calls.slice(-2).map(([daemonDir]) => daemonDir))).toEqual(
      new Set(['owner-alpha', 'owner-charlie'].map((game) => join(home, '.local/share/ogm/daemons', game))),
    );
    expect(store.rows.get('owner-alpha')?.status).toBe('running');
    expect(store.rows.get('owner-charlie')?.status).toBe('running');
    expect(
      systemctlCalls(runner).filter((call) => call.includes('owner-alpha') || call.includes('owner-charlie')),
    ).toEqual(['--user start ogm-aiur@owner-alpha.service', '--user start ogm-aiur@owner-charlie.service']);
  });

  it('fails closed when a live peer cannot pass membership refresh preflight', async () => {
    const home = await tempHome();
    const { fleet, runner } = buildFleet(home);

    await expect(fleet.ensureDaemon('owner/alpha', 'feature')).resolves.toMatchObject({ status: 'running' });
    await expect(fleet.ensureDaemon('owner/bravo', 'feature')).resolves.toMatchObject({ status: 'running' });
    await rm(join(home, '.local/share/ogm/daemons/owner-alpha/.aiur/config'));

    await expect(fleet.ensureDaemon('owner/charlie', 'feature')).resolves.toEqual({
      status: 'stopped',
      reasons: ['owner-alpha: missing .aiur/config'],
    });
    expect(systemctlCalls(runner)).not.toContain('--user start ogm-aiur@owner-charlie.service');
  });

  it('refuses a fifth daemon with waiting_capacity while four are live, without touching systemd', async () => {
    const home = await tempHome();
    const store = memoryStore([liveRow(1), liveRow(2, 'idle'), liveRow(3), liveRow(4)]);
    const { fleet, runner } = buildFleet(home, { store });

    await expect(fleet.ensureDaemon(repo, 'feature')).resolves.toEqual({ status: 'waiting_capacity', live: 4 });
    expect(runner.calls).toEqual([]);
  });

  it('holds the cap when several repos are admitted at once', async () => {
    const home = await tempHome();
    const store = memoryStore([liveRow(1), liveRow(2), liveRow(3)]);
    const { fleet } = buildFleet(home, { store, preflight: okPreflight });

    const results = await Promise.all(['owner/a', 'owner/b', 'owner/c'].map((r) => fleet.ensureDaemon(r, 'feature')));

    expect(results.map((result) => result.status).sort()).toEqual(['running', 'waiting_capacity', 'waiting_capacity']);
    expect(new Set([...store.rows.values()].map((row) => row.port)).size).toBe(store.rows.size);
  });

  it('does not count a starting row left by a previous process, and frees it on the idle sweep', async () => {
    const home = await tempHome();
    const store = memoryStore([liveRow(1), liveRow(2), liveRow(3), liveRow(4, 'starting')]);
    const { fleet, runner } = buildFleet(home, { store, preflight: okPreflight });

    await expect(fleet.ensureDaemon(repo, 'feature')).resolves.toMatchObject({ status: 'running' });
    await expect(fleet.stopIdleDaemons()).resolves.toContain('owner-game4');
    expect(systemctlCalls(runner)).toContain('--user stop ogm-aiur@owner-game4.service');
    expect(store.rows.get('owner-game4')?.status).toBe('stopped');
  });

  it('treats repo names case-insensitively and gives colliding names distinct slugs', async () => {
    const home = await tempHome();
    const { fleet, store } = buildFleet(home);

    await fleet.ensureDaemon('Owner/My.Game', 'feature');
    await fleet.ensureDaemon('owner/my-game', 'feature');
    await expect(fleet.daemonFor('OWNER/MY.GAME')).resolves.toMatchObject({ daemon: { port: 4101 } });

    expect([...store.rows.keys()]).toEqual(['owner-my-game', expect.stringMatching(/^owner-my-game-[0-9a-f]{4}$/)]);
  });

  it('starts a daemon when three are live and a fourth is stopped', async () => {
    const home = await tempHome();
    const store = memoryStore([liveRow(1), liveRow(2), liveRow(3), liveRow(4, 'stopped')]);
    const { fleet } = buildFleet(home, { store, preflight: okPreflight });

    await expect(fleet.ensureDaemon(repo, 'feature')).resolves.toMatchObject({
      status: 'running',
      daemon: { port: 4105 },
    });
  });

  it('wakes an idle daemon for a new job without starting another unit', async () => {
    const home = await tempHome();
    const store = memoryStore([liveRow(1, 'idle', { idleSince: '2026-11-01T00:00:00.000Z' })]);
    const { fleet, runner } = buildFleet(home, { store });

    await expect(fleet.ensureDaemon('owner/game1', 'feature')).resolves.toMatchObject({ status: 'running' });
    expect(runner.calls).toEqual([]);
    expect(store.rows.get('owner-game1')).toMatchObject({ status: 'running', idleSince: null });
  });

  it('allows two agents only when a creation and an edit are admitted on the same repo', async () => {
    const home = await tempHome();
    const { fleet, store, jobs } = buildFleet(home);

    await fleet.ensureDaemon(repo, 'new_game');
    expect(store.rows.get(slug)?.maxConcurrentAgents).toBe(1);

    jobs[repo] = ['new_game'];
    await fleet.ensureDaemon(repo, 'feature');
    expect(store.rows.get(slug)?.maxConcurrentAgents).toBe(2);
    const config = parse(await readFile(join(home, '.local/share/ogm/daemons', slug, '.aiur/config'), 'utf8'));
    expect(config.agent.max_concurrent_agents).toBe(2);
  });

  it('restarts once when health never answers, then stops the unit and records the error', async () => {
    const home = await tempHome();
    const { fleet, store, runner, alerts } = buildFleet(home, { fetch: fakeFetch([503]) });

    const result = await fleet.ensureDaemon(repo, 'feature');

    expect(result).toMatchObject({ status: 'stopped' });
    expect(systemctlCalls(runner)).toEqual([
      `--user start ogm-aiur@${slug}.service`,
      `--user restart ogm-aiur@${slug}.service`,
      `--user stop ogm-aiur@${slug}.service`,
    ]);
    expect(store.rows.get(slug)?.status).toBe('stopped');
    expect(store.rows.get(slug)?.lastError).toContain('healthz');
    expect(alerts).toHaveLength(1);
  });

  it('reaches running when the daemon answers after its one restart', async () => {
    const home = await tempHome();
    const firstWindow = READY_TIMEOUT_MS / START_POLL_MS + 1;
    const { fleet, runner } = buildFleet(home, { fetch: fakeFetch([...Array(firstWindow).fill(503), 200]) });

    await expect(fleet.ensureDaemon(repo, 'feature')).resolves.toMatchObject({ status: 'running' });
    expect(systemctlCalls(runner)).toEqual([
      `--user start ogm-aiur@${slug}.service`,
      `--user restart ogm-aiur@${slug}.service`,
    ]);
  });

  it('refuses to start when the builder bot token is missing, naming the variable only', async () => {
    const home = await tempHome();
    const { fleet, runner } = buildFleet(home, {
      env: { ...(await import('./helpers.js')).fleetEnv(home), builderBotToken: undefined },
    });

    await expect(fleet.ensureDaemon(repo, 'feature')).resolves.toEqual({
      status: 'stopped',
      reasons: ['OGM_BUILDER_BOT_TOKEN is not set'],
    });
    expect(runner.calls).toEqual([]);
  });
});

describe('stopIdleDaemons', () => {
  const at = new Date('2026-11-01T12:00:00.000Z');
  const ago = (ms: number) => new Date(at.getTime() - ms).toISOString();

  it('stops only daemons idle for at least 30 minutes with no active job', async () => {
    const home = await tempHome();
    const store = memoryStore([
      liveRow(1, 'idle', { idleSince: ago(31 * 60_000) }),
      liveRow(2, 'idle', { idleSince: ago(31 * 60_000) }),
      liveRow(3, 'idle', { idleSince: ago(IDLE_STOP_MS - 60_000) }),
      liveRow(4, 'running'),
    ]);
    const { fleet, runner } = buildFleet(home, {
      store,
      jobs: { 'owner/game2': ['feature'] },
      preflight: okPreflight,
    });

    await expect(fleet.stopIdleDaemons(at)).resolves.toEqual(['owner-game1']);
    expect(systemctlCalls(runner)).toEqual(['--user stop ogm-aiur@owner-game1.service']);
    expect(store.rows.get('owner-game1')?.status).toBe('stopped');
    expect(store.rows.get('owner-game2')).toMatchObject({ status: 'running', idleSince: null });
    expect(store.rows.get('owner-game3')?.status).toBe('idle');
    expect(store.rows.get('owner-game4')).toMatchObject({ status: 'idle', idleSince: at.toISOString() });
  });

  it('keeps the workspaces directory when it stops a daemon', async () => {
    const home = await tempHome();
    const { fleet, store } = buildFleet(home);
    await fleet.ensureDaemon(repo, 'feature');
    await store.update(slug, { status: 'idle', idleSince: ago(IDLE_STOP_MS) });

    await fleet.stopIdleDaemons(at);

    expect((await stat(join(home, '.local/share/ogm/daemons', slug, 'workspaces'))).isDirectory()).toBe(true);
  });
});

describe('checkHealth', () => {
  it('restarts after three misses and stops with an alert after six', async () => {
    const home = await tempHome();
    const store = memoryStore([liveRow(1)]);
    const { fleet, runner, alerts } = buildFleet(home, { store, fetch: fakeFetch([503]) });

    for (let tick = 0; tick < 3; tick += 1) await fleet.checkHealth();
    expect(systemctlCalls(runner)).toEqual(['--user restart ogm-aiur@owner-game1.service']);

    for (let tick = 0; tick < 3; tick += 1) await fleet.checkHealth();
    expect(systemctlCalls(runner)).toEqual([
      '--user restart ogm-aiur@owner-game1.service',
      '--user stop ogm-aiur@owner-game1.service',
    ]);
    expect(store.rows.get('owner-game1')?.status).toBe('stopped');
    expect(alerts).toHaveLength(2);
  });
});

describe('daemonFor and listDaemons', () => {
  it('returns a client for a running daemon and nothing for an unknown repo', async () => {
    const home = await tempHome();
    const { fleet } = buildFleet(home);
    await fleet.ensureDaemon(repo, 'feature');

    const found = await fleet.daemonFor(repo);
    expect(found?.client.baseUrl).toBe('http://127.0.0.1:4101');
    expect(found?.daemon.clientToken).toBe('aiur_token1');
    await expect(fleet.daemonFor('owner/none')).resolves.toBeNull();
    await expect(fleet.listDaemons('running')).resolves.toHaveLength(1);
    await expect(fleet.listDaemons('stopped')).resolves.toHaveLength(0);
  });
});
