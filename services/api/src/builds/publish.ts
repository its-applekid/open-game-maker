import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DesignDocSchema, gameManifestSchema } from '@ogm/contracts';
import { schema } from '@ogm/db';
import { buildDir, markComplete } from '@ogm/games-host/layout';
import { and, eq, inArray, lt } from 'drizzle-orm';

import { budgetDefaults } from '../admin/family.js';
import type { AppDeps } from '../app/types.js';
import { switchBranchBuild } from '../design/reapply.js';
import { getDesignRuntime } from '../design/routes.js';
import { resolveBranch } from '../design/store.js';
import { isTerminal } from '../jobs/state.js';
import { markTerminal } from '../jobs/spend-cap.js';
import { releaseRuntimeFor } from '../releases/routes.js';
import { registerBuild, updateBuild } from '../releases/service.js';
import { untarGz } from './untar.js';

// Jobs whose merged PR must become a playable build before the job is done; a scope job ships no build.
export const BUILD_KINDS = ['new_game', 'feature', 'repair'] as const;

const SYSTEM_ACTOR = 'system:builder';

// `.staging` never matches the games-host id pattern, so nothing under it is ever served.
const stagingRoot = (deps: AppDeps) => join(deps.config.gamesRoot, '.staging');
const stagedDir = (deps: AppDeps, jobId: string) => join(stagingRoot(deps), jobId);

function jobRow(deps: AppDeps, jobId: string) {
  return deps.db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId)).get();
}

export function awaitsBuild(deps: AppDeps, jobId: string): boolean {
  const job = jobRow(deps, jobId);
  return job !== undefined && (BUILD_KINDS as readonly string[]).includes(job.kind) && !isTerminal(job.state);
}

// Aiur reported the run completed (its PR merged): the build may be published once it is staged.
export function runCompleted(deps: AppDeps, jobId: string): boolean {
  const row = deps.db
    .select({ lifecycle: schema.jobProjections.lifecycle })
    .from(schema.jobProjections)
    .where(eq(schema.jobProjections.jobId, jobId))
    .get();
  return row?.lifecycle === 'completed';
}

// Unpacks the hook's archive beside the games root and swaps it in whole, replacing an earlier upload.
export async function stageArtifact(deps: AppDeps, jobId: string, gitSha: string, archive: Buffer): Promise<void> {
  const temporary = join(stagingRoot(deps), `.${jobId}.${randomUUID()}`);
  try {
    await untarGz(archive, join(temporary, 'build'));
    await writeFile(join(temporary, 'git-sha'), gitSha);
    await rm(stagedDir(deps, jobId), { recursive: true, force: true });
    await rename(temporary, stagedDir(deps, jobId));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export type PublishOutcome = { state: 'done'; buildId: string } | { state: 'failed'; reason: string } | null;

const publishing = new Set<string>();

// Publishes a staged build: register, move into `<gamesRoot>/<gameId>/<buildId>/`, write `.complete` last, mark it
// tested, switch the job's branch to it, then finish the job. Any failure fails the job and leaves nothing complete.
export async function publishStaged(deps: AppDeps, jobId: string): Promise<PublishOutcome> {
  if (publishing.has(jobId) || !awaitsBuild(deps, jobId) || !existsSync(stagedDir(deps, jobId))) return null;
  publishing.add(jobId);
  const job = jobRow(deps, jobId)!;
  const release = releaseRuntimeFor(deps);
  let buildId: string | undefined;
  let target: string | undefined;
  try {
    const staged = stagedDir(deps, jobId);
    const files = join(staged, 'build');
    const manifest = gameManifestSchema.safeParse(await readJson(join(files, 'manifest.json')));
    if (!manifest.success) throw new PublishFailure('manifest_invalid');
    if (!DesignDocSchema.safeParse(await readJson(join(files, 'design', 'design.json'))).success) {
      throw new PublishFailure('design_invalid');
    }
    const saveSchemaVersion = (manifest.data as Record<string, unknown>).saveSchemaVersion;
    const achievements = await readFile(join(files, 'achievements.json')).catch(() => Buffer.alloc(0));
    const branch = resolveBranch(deps.sqlite, job.gameId, job.branchId);

    const build = registerBuild(deps, release, job.gameId, {
      branchId: branch.id,
      gitSha: (await readFile(join(staged, 'git-sha'), 'utf8')).trim(),
      jobId,
      sdkVersion: manifest.data.sdk,
      saveSchemaVersion: Number.isSafeInteger(saveSchemaVersion) ? (saveSchemaVersion as number) : 0,
      achievementCatalogHash: createHash('sha256').update(achievements).digest('hex'),
      artifactPath: join(deps.config.gamesRoot, job.gameId),
    });
    buildId = build.id;
    target = buildDir(deps.config.gamesRoot, job.gameId, build.id);
    deps.db.update(schema.builds).set({ artifactPath: target }).where(eq(schema.builds.id, build.id)).run();

    await mkdir(join(deps.config.gamesRoot, job.gameId), { recursive: true });
    await rename(files, target);
    await markComplete(target);
    await updateBuild(deps, release, build.id, 'tested');
    const design = getDesignRuntime(deps);
    const switched = await switchBranchBuild(deps.sqlite, design.source, branch, build.id, {
      actor: SYSTEM_ACTOR,
      token: 0,
    });
    design.stream.publish(branch.id, switched.transaction);

    markTerminal(lifecycle(deps), jobId, 'done', { deferRelease: true });
    deps.log({ event: 'build_published', jobId, gameId: job.gameId, buildId: build.id });
    return { state: 'done', buildId: build.id };
  } catch (error) {
    const reason = error instanceof PublishFailure ? error.message : errorName(error);
    if (target) await rm(target, { recursive: true, force: true }).catch(() => undefined);
    if (buildId) await updateBuild(deps, release, buildId, 'failed').catch(() => undefined);
    markTerminal(lifecycle(deps), jobId, 'failed', { deferRelease: true });
    deps.log({ event: 'build_publish_failed', jobId, gameId: job.gameId, reason });
    return { state: 'failed', reason };
  } finally {
    await rm(stagedDir(deps, jobId), { recursive: true, force: true });
    publishing.delete(jobId);
  }
}

// The Aiur feed's terminal verdict for a run. A build job is done only once its merged build is playable, so a
// completed run hands it to the publisher (or leaves it for the upload or the sweep) instead of finishing it.
export function finishRun(deps: AppDeps, jobId: string, state: 'done' | 'failed' | 'cancelled'): void {
  if (state === 'done' && awaitsBuild(deps, jobId)) void publishStaged(deps, jobId);
  else markTerminal(lifecycle(deps), jobId, state, { deferRelease: true });
}

// Fails build jobs whose run completed `graceMs` ago without a build arriving, and drops staged builds of jobs that
// ended some other way.
export async function sweepBuilds(deps: AppDeps, graceMs: number, now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - graceMs).toISOString();
  const overdue = deps.db
    .select({ jobId: schema.jobs.id, gameId: schema.jobs.gameId, state: schema.jobs.state })
    .from(schema.jobs)
    .innerJoin(schema.jobProjections, eq(schema.jobProjections.jobId, schema.jobs.id))
    .where(
      and(
        inArray(schema.jobs.kind, [...BUILD_KINDS]),
        eq(schema.jobProjections.lifecycle, 'completed'),
        lt(schema.jobProjections.updatedAt, cutoff),
      ),
    )
    .all();
  for (const job of overdue) {
    if (isTerminal(job.state)) continue;
    if (existsSync(stagedDir(deps, job.jobId))) {
      await publishStaged(deps, job.jobId);
      continue;
    }
    markTerminal(lifecycle(deps), job.jobId, 'failed', { deferRelease: true });
    deps.log({ event: 'build_publish_failed', jobId: job.jobId, gameId: job.gameId, reason: 'build_not_received' });
  }
  for (const entry of await readdir(stagingRoot(deps)).catch(() => [])) {
    if (!entry.startsWith('.') && !awaitsBuild(deps, entry) && !publishing.has(entry)) {
      await rm(stagedDir(deps, entry), { recursive: true, force: true });
    }
  }
}

export function startBuildSweep(deps: AppDeps, options: { graceMs: number; intervalMs: number }): () => void {
  const timer = setInterval(() => {
    sweepBuilds(deps, options.graceMs).catch((error: unknown) =>
      deps.log({ event: 'build_sweep_failed', reason: errorName(error) }),
    );
  }, options.intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

class PublishFailure extends Error {}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown_error';
}

function lifecycle(deps: AppDeps) {
  return { db: deps.db, sqlite: deps.sqlite, events: deps.events, defaults: budgetDefaults(deps) };
}
