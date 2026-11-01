import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Hono, type Context } from 'hono';

import { JobBundle } from '@ogm/contracts';
import { schema } from '@ogm/db';

import type { ApiBindings, AppDeps } from '../app/types.js';

// Resolves an after_create hook's bearer to the one game repo whose daemon holds that secret, or null.
export type HookDaemonResolver = (secret: string, deps: AppDeps) => Promise<string | null>;
export type SkillTarball = { version: string; tgz: Buffer };

// Anything token- or email-shaped never leaves in a bundle.
const LEAKY =
  /(?<![A-Za-z0-9])(aiur_|ghp_|gho_|github_pat_|sk-|whsec_)[A-Za-z0-9_-]{4,}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

// OGM-034 writes each daemon's secret to `~/.config/ogm/daemons/<slug>/hook-secret` (0600) and its env file names
// only that path; the secret itself never sits in the daemon's environment.
export function hookSecretFiles(home: string): HookDaemonResolver {
  return async (secret, deps) => {
    const given = digest(secret);
    for (const row of await deps.db
      .select({ slug: schema.gameDaemons.slug, repo: schema.gameDaemons.repo })
      .from(schema.gameDaemons)) {
      const stored = await readFile(join(home, '.config/ogm/daemons', row.slug, 'hook-secret'), 'utf8').catch(
        () => undefined,
      );
      if (stored !== undefined && stored.trim() !== '' && timingSafeEqual(given, digest(stored.trim())))
        return row.repo;
    }
    return null;
  };
}

export function bundleRoutes(opts: { daemonForSecret: HookDaemonResolver; skills: () => SkillTarball }) {
  async function daemonRepo(c: Context<ApiBindings>): Promise<string | null> {
    const match = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '');
    return match ? opts.daemonForSecret(match[1], c.get('deps')) : null;
  }

  return new Hono<ApiBindings>()
    .get('/jobs/by-ticket/:identifier/bundle', async (c) => {
      const repo = await daemonRepo(c);
      if (!repo) return c.json({ error: { code: 'unauthenticated' } }, 401);
      const deps = c.get('deps');
      const resolver = deps.registry.ticketJobResolver;
      const job = resolver ? await resolver(repo, c.req.param('identifier')) : null;
      if (!job || job.repo.toLowerCase() !== repo.toLowerCase()) return c.json({ error: { code: 'not_found' } }, 404);

      const { version } = opts.skills();
      const bundle = JobBundle.parse({
        v: 1,
        jobId: job.jobId,
        gameId: job.gameId,
        repo: job.repo,
        kind: job.kind,
        skillPackVersion: version,
        skillPackUrl: new URL(`/internal/skills/${encodeURIComponent(version)}.tgz`, c.req.url).href,
        gameContext: { ...job.game, branch: 'main', lockfilePath: 'assets.lock.json' },
        ...(job.kind === 'repair' && job.diagnostics ? { diagnostics: job.diagnostics } : {}),
      });
      if (LEAKY.test(JSON.stringify(bundle))) {
        deps.log({ event: 'bundle_refused', jobId: job.jobId, reason: 'secret- or email-shaped value' });
        return c.json({ error: { code: 'internal' } }, 500);
      }
      return c.json(bundle);
    })
    .get('/skills/:file', async (c) => {
      if (!(await daemonRepo(c))) return c.json({ error: { code: 'unauthenticated' } }, 401);
      const { version, tgz } = opts.skills();
      if (c.req.param('file') !== `${version}.tgz`) return c.json({ error: { code: 'not_found' } }, 404);
      return c.body(new Uint8Array(tgz), 200, { 'content-type': 'application/gzip' });
    });
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
