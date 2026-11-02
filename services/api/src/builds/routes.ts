import { homedir } from 'node:os';

import { Hono } from 'hono';

import type { ApiBindings } from '../app/types.js';
import { hookSecretFiles, type HookDaemonResolver } from '../internal/bundle.js';
import { awaitsBuild, publishStaged, runCompleted, stageArtifact } from './publish.js';
import { ARCHIVE_LIMITS, BadArchive } from './untar.js';

// The game repo's `before_remove` hook uploads its sandboxed build here with its daemon's hook secret.
export const prefix = '/internal';

const SHA = /^[0-9a-f]{40}$/u;

export function buildRoutes(opts: { daemonForSecret: HookDaemonResolver }) {
  return new Hono<ApiBindings>().post('/jobs/by-ticket/:identifier/build', async (c) => {
    const deps = c.get('deps');
    const bearer = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '');
    const repo = bearer ? await opts.daemonForSecret(bearer[1]!, deps) : null;
    if (!repo) return c.json({ error: { code: 'unauthenticated' } }, 401);
    const resolver = deps.registry.ticketJobResolver;
    const job = resolver ? await resolver(repo, c.req.param('identifier')) : null;
    if (!job || job.repo.toLowerCase() !== repo.toLowerCase()) return c.json({ error: { code: 'not_found' } }, 404);
    if (!awaitsBuild(deps, job.jobId)) return c.json({ error: { code: 'job_not_awaiting_build' } }, 409);

    const gitSha = c.req.header('x-gm-sha') ?? '';
    if (!SHA.test(gitSha)) return c.json({ error: { code: 'invalid_sha' } }, 400);
    if (Number(c.req.header('content-length') ?? 0) > ARCHIVE_LIMITS.compressedBytes) {
      return c.json({ error: { code: 'archive_too_large' } }, 413);
    }
    try {
      await stageArtifact(deps, job.jobId, gitSha, Buffer.from(await c.req.arrayBuffer()));
    } catch (error) {
      if (error instanceof BadArchive) return c.json({ error: { code: error.message } }, 422);
      throw error;
    }

    // The upload can land before or after Aiur reports the merge; whichever comes second publishes.
    const outcome = runCompleted(deps, job.jobId) ? await publishStaged(deps, job.jobId) : null;
    return c.json(outcome ?? { state: 'staged' }, !outcome ? 202 : outcome.state === 'done' ? 201 : 422);
  });
}

export default buildRoutes({ daemonForSecret: hookSecretFiles(homedir()) });
