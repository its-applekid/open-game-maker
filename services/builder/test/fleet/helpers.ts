import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { createFleet, type FleetDeps } from '../../src/fleet/fleet.js';
import type { RunResult, Runner } from '../../src/fleet/systemctl.js';
import type { DaemonRow, DaemonStore, FleetEnv, JobKind } from '../../src/fleet/types.js';

const homes: string[] = [];

// The policy render refuses workspaces under /tmp, so test homes live under the real home directory.
export async function tempHome(): Promise<string> {
  const home = await mkdtemp(join(homedir(), '.ogm-fleet-test-'));
  homes.push(home);
  await mkdir(join(home, 'github/aiur/src/examples/workflows'), { recursive: true });
  await writeFile(join(home, 'github/aiur/src/examples/workflows/github-codex.prompt.md'), 'Work the ticket.\n');
  return home;
}

export async function cleanupHomes(): Promise<void> {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
}

export function memoryStore(initial: DaemonRow[] = []): DaemonStore & { rows: Map<string, DaemonRow> } {
  const rows = new Map(initial.map((row) => [row.slug, { ...row }]));
  return {
    rows,
    async byRepo(repo) {
      return [...rows.values()].find((row) => row.repo === repo);
    },
    async list() {
      return [...rows.values()];
    },
    async insert(row) {
      rows.set(row.slug, { ...row });
    },
    async update(slug, patch) {
      const row = { ...(rows.get(slug) as DaemonRow), ...patch };
      rows.set(slug, row);
      return row;
    },
  };
}

export type Call = { cmd: string; args: string[]; cwd?: string };

export function fakeRunner(): Runner & { calls: Call[] } {
  const calls: Call[] = [];
  let minted = 0;
  const runner = (async (cmd, args, opts = {}) => {
    calls.push({ cmd, args, cwd: opts.cwd });
    const result: RunResult = { code: 0, stdout: '', stderr: '' };
    if (args[0] === 'token' && args[1] === 'create') {
      minted += 1;
      result.stdout = `aiur_token${minted}\n`;
    }
    return result;
  }) as Runner & { calls: Call[] };
  runner.calls = calls;
  return runner;
}

export function fleetEnv(home: string, overrides: Partial<FleetEnv> = {}): FleetEnv {
  return {
    home,
    builderBotToken: 'ghp_builder',
    builderBotLogin: 'ogm-builder',
    intakeLogin: 'ogm-intake',
    assetsLocalDir: join(home, 'games/open-game-maker-2000/assets-local'),
    ...overrides,
  };
}

// healthz answers from `statuses` in order, then keeps answering with the last one.
export function fakeFetch(statuses: number[]): typeof fetch & { urls: string[] } {
  const urls: string[] = [];
  const queue = [...statuses];
  const impl = (async (input: string | URL | Request) => {
    urls.push(String(input));
    const status = queue.length > 1 ? (queue.shift() as number) : (queue[0] ?? 200);
    return new Response(null, { status });
  }) as typeof fetch & { urls: string[] };
  impl.urls = urls;
  return impl;
}

export function liveRow(
  index: number,
  status: DaemonRow['status'] = 'running',
  patch: Partial<DaemonRow> = {},
): DaemonRow {
  const slug = `owner-game${index}`;
  return {
    slug,
    repo: `owner/game${index}`,
    checkoutPath: `/home/x/.local/share/ogm/daemons/${slug}`,
    unit: `ogm-aiur@${slug}.service`,
    envFile: `/home/x/.config/ogm/env/ogm-aiur@${slug}.env`,
    port: 4100 + index,
    status,
    lastHealthAt: null,
    lastError: null,
    startedAt: null,
    idleSince: null,
    maxConcurrentAgents: 1,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...patch,
  };
}

export function buildFleet(home: string, overrides: Partial<FleetDeps> & { jobs?: Record<string, JobKind[]> } = {}) {
  const store = (overrides.store as ReturnType<typeof memoryStore> | undefined) ?? memoryStore();
  const runner = (overrides.runner as ReturnType<typeof fakeRunner> | undefined) ?? fakeRunner();
  const fetchImpl = (overrides.fetch as ReturnType<typeof fakeFetch> | undefined) ?? fakeFetch([200]);
  const sleeps: number[] = [];
  const alerts: string[] = [];
  const jobs = overrides.jobs ?? {};
  const fleet = createFleet({
    env: fleetEnv(home),
    activeJobs: async (repo) => (jobs[repo] ?? []).map((kind) => ({ kind })),
    portFree: async () => true,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    alert: (message) => {
      alerts.push(message);
    },
    ...overrides,
    store,
    runner,
    fetch: fetchImpl,
  });
  return { fleet, store, runner, fetch: fetchImpl, sleeps, alerts, jobs };
}

export function systemctlCalls(runner: { calls: Call[] }): string[] {
  return runner.calls.filter((call) => call.cmd === 'systemctl').map((call) => call.args.join(' '));
}
