import { Hono } from 'hono';
import { z } from 'zod';

import type { ChangeNote } from '@ogm/contracts';
import * as designLog from '@ogm/design-log';
import { authorize } from '@ogm/policy';

import { actorFromPrincipal, requireAuthorization } from '../accounts/families.js';
import { requirePrincipal } from '../app/principal.js';
import { HttpError } from '../app/errors.js';
import type { ApiBindings, AppDeps } from '../app/types.js';
import { parseBody } from '../app/validate.js';
import { FsBaseDocSource } from '../design/base-doc.js';
import { findGameForFamily, hasGameGrant } from '../games/games.js';
import { CommitUnavailable, HttpCommitClient } from './commit-client.js';
import { checkPublishRights, RightsCheckUnavailable } from './rights.js';
import {
  ReleaseError,
  addChangeNote,
  listBuilds,
  listReleases,
  publish,
  published,
  registerBuild,
  rollback,
  updateBuild,
  type ReleaseRuntime,
  type VersionCounts,
} from './service.js';

export const prefix = '/';
export type { ReleaseRuntime } from './service.js';

const runtimes = new WeakMap<AppDeps, ReleaseRuntime>();

export function setReleaseRuntime(deps: AppDeps, runtime: ReleaseRuntime): void {
  runtimes.set(deps, runtime);
}

function defaultDeriveVersion(counts: VersionCounts): string {
  const derive = (designLog as unknown as { deriveVersion?: (input: VersionCounts) => string }).deriveVersion;
  if (!derive) throw new ReleaseError('version_service_unavailable', 502);
  return derive(counts);
}

export function setup(deps: AppDeps): void {
  if (runtimes.has(deps)) return;
  runtimes.set(deps, {
    source: new FsBaseDocSource(deps.config.gamesRoot),
    commit: new HttpCommitClient(deps.config.commitInternalUrl, deps.config.commitServiceToken),
    checkRights: checkPublishRights,
    countSavesAboveSchema: async () => null,
    deriveVersion: defaultDeriveVersion,
    onBuildTested: async () => undefined,
    gamesOrigin: deps.config.gamesOrigin,
    now: () => new Date(),
  });
}

function runtime(c: { get(name: 'deps'): AppDeps }): ReleaseRuntime {
  const found = runtimes.get(c.get('deps'));
  if (!found) throw new Error('release runtime was not configured');
  return found;
}

function requireBuilder(c: Parameters<typeof requirePrincipal>[0]): void {
  const principal = requirePrincipal(c, ['service']);
  if (principal.service !== 'builder') throw new HttpError(403, 'forbidden');
}

function requirePlayer(c: Parameters<typeof requirePrincipal>[0], gameId: string): void {
  const principal = requirePrincipal(c, ['user']);
  const game = findGameForFamily(c.get('deps').db, gameId, principal.familyId);
  requireAuthorization(
    authorize(actorFromPrincipal(principal), 'game.play', {
      familyId: game.familyId,
      ownerId: game.ownerId,
      visibility: game.visibility,
      granted: hasGameGrant(c.get('deps').db, game.id, principal.userId),
    }),
  );
}

function requirePublisher(c: Parameters<typeof requirePrincipal>[0], gameId: string) {
  const principal = requirePrincipal(c, ['user']);
  const game = findGameForFamily(c.get('deps').db, gameId, principal.familyId);
  requireAuthorization(
    authorize(actorFromPrincipal(principal), 'game.publish', { familyId: game.familyId, ownerId: game.ownerId }),
  );
  return principal;
}

function errorResponse(c: Parameters<Parameters<Hono<ApiBindings>['onError']>[0]>[1], error: unknown): Response {
  if (error instanceof CommitUnavailable) return c.json({ error: 'commit_unavailable' }, 502);
  if (error instanceof RightsCheckUnavailable) return c.json({ error: 'rights_check_unavailable' }, 502);
  if (!(error instanceof ReleaseError)) throw error;
  if (error.payload && 'verdict' in error.payload) return c.json(error.payload, 403);
  if (error.payload && 'rights' in error.payload) return c.json(error.payload, 422);
  return c.json({ error: error.code }, error.status);
}

async function releaseAction<T>(
  c: Parameters<Parameters<Hono<ApiBindings>['onError']>[0]>[1],
  action: () => Promise<T>,
): Promise<Response> {
  try {
    return c.json(await action(), 201);
  } catch (error) {
    return errorResponse(c, error);
  }
}

const note = z.object({
  jobId: z.string().optional(),
  txId: z.string().optional(),
  kind: z.enum(['fix', 'add', 'change', 'remove']),
  text: z.string().trim().min(1).max(500),
});
const buildBody = z
  .object({
    branchId: z.string().min(1),
    gitSha: z.string().regex(/^[0-9a-f]{40}$/),
    jobId: z.string().optional(),
    sdkVersion: z.string().min(1),
    saveSchemaVersion: z.number().int().nonnegative(),
    migratesFromSchema: z.number().int().nonnegative().optional(),
    achievementCatalogHash: z.string().regex(/^[0-9a-f]{64}$/),
    artifactPath: z.string().min(1),
    changeNotes: z.array(note).optional(),
  })
  .strict();
const buildPatch = z.object({ status: z.enum(['building', 'tested', 'failed']) }).strict();
const changelog = z
  .object({ summary: z.string().trim().min(1), items: z.array(note).optional() })
  .transform((value) => ({
    summary: value.summary,
    items: value.items ?? [],
  }));
const publishBody = z.object({ buildId: z.string().min(1), changelog: changelog.optional() }).strict();
const rollbackBody = z.object({ releaseId: z.string().min(1) }).strict();
const changeNoteBody = z
  .object({ jobId: z.string().optional(), kind: note.shape.kind, text: note.shape.text })
  .strict();

const routes = new Hono<ApiBindings>()
  .post('/internal/games/:gameId/builds', async (c) => {
    requireBuilder(c);
    const body = await parseBody(c, buildBody);
    try {
      return c.json(registerBuild(c.get('deps'), runtime(c), c.req.param('gameId'), body), 201);
    } catch (error) {
      return errorResponse(c, error);
    }
  })
  .patch('/internal/builds/:buildId', async (c) => {
    requireBuilder(c);
    const body = await parseBody(c, buildPatch);
    try {
      return c.json(await updateBuild(c.get('deps'), runtime(c), c.req.param('buildId'), body.status));
    } catch (error) {
      return errorResponse(c, error);
    }
  })
  .get('/api/v1/games/:gameId/builds', (c) => {
    requirePublisher(c, c.req.param('gameId'));
    return c.json({ builds: listBuilds(c.get('deps'), c.req.param('gameId')) });
  })
  .post('/api/v1/games/:gameId/publish', async (c) => {
    const principal = requirePublisher(c, c.req.param('gameId'));
    const body = await parseBody(c, publishBody);
    return releaseAction(c, () =>
      publish(c.get('deps'), runtime(c), {
        gameId: c.req.param('gameId'),
        buildId: body.buildId,
        actor: principal.userId,
        ...(body.changelog ? { changelog: body.changelog } : {}),
      }),
    );
  })
  .post('/api/v1/games/:gameId/rollback', async (c) => {
    const principal = requirePublisher(c, c.req.param('gameId'));
    const body = await parseBody(c, rollbackBody);
    return releaseAction(c, () =>
      rollback(c.get('deps'), runtime(c), {
        gameId: c.req.param('gameId'),
        releaseId: body.releaseId,
        actor: principal.userId,
      }),
    );
  })
  .get('/api/v1/games/:gameId/releases', (c) => {
    requirePublisher(c, c.req.param('gameId'));
    return c.json({ releases: listReleases(c.get('deps'), c.req.param('gameId')) });
  })
  .get('/api/v1/games/:gameId/published', (c) => {
    requirePlayer(c, c.req.param('gameId'));
    try {
      const release = published(c.get('deps'), c.req.param('gameId'));
      const etag = `"${release.id}"`;
      c.header('ETag', etag);
      c.header('Cache-Control', 'no-cache');
      if (c.req.header('if-none-match') === etag) return c.body(null, 304);
      return c.json({
        releaseId: release.id,
        version: release.version,
        buildUrl: `${runtime(c).gamesOrigin.replace(/\/$/, '')}/g/${release.gameId}/${release.buildId}/`,
        changelog: release.changelog,
      });
    } catch (error) {
      return errorResponse(c, error);
    }
  })
  .post('/api/v1/games/:gameId/change-notes', async (c) => {
    const principal = requirePrincipal(c, ['job']);
    const gameId = c.req.param('gameId');
    if (principal.gameId !== gameId) throw new HttpError(403, 'forbidden');
    const body = await parseBody(c, changeNoteBody);
    if (body.jobId !== undefined && body.jobId !== principal.jobId) throw new HttpError(403, 'forbidden');
    return c.json(
      addChangeNote(c.get('deps'), runtime(c), {
        gameId,
        jobId: principal.jobId,
        kind: body.kind as ChangeNote['kind'],
        text: body.text,
      }),
      201,
    );
  });

export default routes;
