import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { JobBundle } from '@ogm/contracts';
import { schema } from '@ogm/db';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app/app.js';
import type { TicketJob } from '../../src/app/registry.js';
import { bundleRoutes, hookSecretFiles } from '../../src/internal/bundle.js';
import { tarGz } from '../../src/internal/tarball.js';
import { makeApp, makeDeps } from '../helpers.js';

const SECRET_A = 'hook-secret-of-daemon-a';
const SECRET_B = 'hook-secret-of-daemon-b';
const REPO_A = 'everdred-games/gm-g1';
const REPO_B = 'everdred-games/gm-g2';

function job(overrides: Partial<TicketJob> = {}): TicketJob {
  return {
    jobId: 'j1',
    gameId: 'g1',
    repo: REPO_A,
    kind: 'feature',
    game: { title: 'Castle Run', family: 'chunky-low-poly', pov: 'iso', genre: 'platformer', multiplayer: false },
    ...overrides,
  };
}

// Two daemons with their secret files, as OGM-034 lays them out, and an app with the internal routes mounted.
async function setup(jobs: TicketJob[] = [job()]) {
  const home = mkdtempSync(join(tmpdir(), 'ogm-bundle-home-'));
  const deps = makeDeps();
  for (const [slug, repo, secret, port] of [
    ['everdred-games-gm-g1', REPO_A, SECRET_A, 4101],
    ['everdred-games-gm-g2', REPO_B, SECRET_B, 4102],
  ] as const) {
    mkdirSync(join(home, '.config/ogm/daemons', slug), { recursive: true });
    writeFileSync(join(home, '.config/ogm/daemons', slug, 'hook-secret'), secret, { mode: 0o600 });
    await deps.db.insert(schema.gameDaemons).values({
      slug,
      repo,
      checkoutPath: `/srv/${slug}`,
      unit: `ogm-aiur@${slug}.service`,
      envFile: `/srv/${slug}.env`,
      port,
      status: 'running',
      createdAt: '2026-11-01T00:00:00Z',
    });
  }
  deps.registry.ticketJobResolver = async (repo, identifier) =>
    jobs.find((candidate) => candidate.repo === repo && identifier === '12') ?? null;
  const app = createApp(deps);
  const tgz = tarGz([{ path: 'gm-core/SKILL.md', content: 'core\n' }]);
  app.route(
    '/internal',
    bundleRoutes({ daemonForSecret: hookSecretFiles(home), skills: () => ({ version: '1.0.0', tgz }) }),
  );
  const get = (path: string, secret?: string) =>
    app.request(`http://127.0.0.1:4000${path}`, secret ? { headers: { authorization: `Bearer ${secret}` } } : {});
  return { deps, get, tgz };
}

describe('GET /internal/jobs/by-ticket/:identifier/bundle', () => {
  it('refuses a request without a daemon hook secret', async () => {
    const { get } = await setup();
    expect((await get('/internal/jobs/by-ticket/12/bundle')).status).toBe(401);
    expect((await get('/internal/jobs/by-ticket/12/bundle', 'not-a-daemon-secret')).status).toBe(401);
  });

  it("answers 404 with no detail for a ticket in another daemon's repo", async () => {
    const { get } = await setup([job({ repo: REPO_A })]);
    const response = await get('/internal/jobs/by-ticket/12/bundle', SECRET_B);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('g1');
  });

  it("refuses a resolver answer outside the daemon's repo", async () => {
    const { deps, get } = await setup();
    deps.registry.ticketJobResolver = async () => job({ repo: REPO_B });
    expect((await get('/internal/jobs/by-ticket/12/bundle', SECRET_A)).status).toBe(404);
  });

  it('serves the bundle for a ticket in the daemon repo, with no diagnostics outside repairs', async () => {
    const { get } = await setup([job({ diagnostics: { reportId: 'r1', bundleKey: 'reports/r1.tgz' } })]);
    const response = await get('/internal/jobs/by-ticket/12/bundle', SECRET_A);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(JobBundle.parse(body)).toEqual({
      v: 1,
      jobId: 'j1',
      gameId: 'g1',
      repo: REPO_A,
      kind: 'feature',
      skillPackVersion: '1.0.0',
      skillPackUrl: 'http://127.0.0.1:4000/internal/skills/1.0.0.tgz',
      gameContext: {
        title: 'Castle Run',
        family: 'chunky-low-poly',
        pov: 'iso',
        genre: 'platformer',
        multiplayer: false,
        branch: 'main',
        lockfilePath: 'assets.lock.json',
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/aiur_|ghp_|sk-|@/);
  });

  it('passes repair diagnostics through', async () => {
    const diagnostics = { reportId: 'r1', bundleKey: 'reports/r1.tgz' };
    const { get } = await setup([job({ kind: 'repair', diagnostics })]);
    expect((await (await get('/internal/jobs/by-ticket/12/bundle', SECRET_A)).json()).diagnostics).toEqual(diagnostics);
  });

  it('answers 500 rather than serve a token- or email-shaped value', async () => {
    for (const title of ['ghp_abcdefghijkl', 'kevin@example.com']) {
      const { deps, get } = await setup([job({ game: { ...job().game, title } })]);
      const response = await get('/internal/jobs/by-ticket/12/bundle', SECRET_A);
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain(title);
      expect(deps.lines.some((line) => line.event === 'bundle_refused')).toBe(true);
    }
  });
});

describe('GET /internal/skills/:version.tgz', () => {
  it('serves the current pack to a daemon and unpacks with tar', async () => {
    const { get, tgz } = await setup();
    expect((await get('/internal/skills/1.0.0.tgz')).status).toBe(401);
    expect((await get('/internal/skills/0.9.0.tgz', SECRET_B)).status).toBe(404);
    const response = await get('/internal/skills/1.0.0.tgz', SECRET_B);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/gzip');
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.equals(tgz)).toBe(true);

    const dir = mkdtempSync(join(tmpdir(), 'ogm-skills-x-'));
    writeFileSync(join(dir, 'pack.tgz'), bytes);
    execFileSync('tar', ['-xzf', 'pack.tgz'], { cwd: dir });
    expect(readFileSync(join(dir, 'gm-core/SKILL.md'), 'utf8')).toBe('core\n');
  });
});

describe('internal context', () => {
  it('is mounted at /internal by the route scan and closed without a hook secret', async () => {
    const { app, mounted } = await makeApp();
    expect(mounted).toContainEqual({ prefix: '/internal', file: 'internal/routes.ts' });
    expect((await app.request('/internal/jobs/by-ticket/1/bundle')).status).toBe(401);
  });
});
