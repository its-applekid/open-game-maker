import { Hono } from 'hono';
import { z } from 'zod';

import { CreateReport, Id, type CreateReportResponse, type IssueWriter, type ReportError } from '@ogm/contracts';
import { schema } from '@ogm/db';
import { authorize, type Actor } from '@ogm/policy';
import { countDistinct, eq } from 'drizzle-orm';

import { actorFromPrincipal, requireAuthorization } from '../accounts/families.js';
import { createRateLimiter } from '../auth/rate-limit.js';
import { hasGameGrant } from '../games/games.js';
import { HttpError } from '../app/errors.js';
import { requirePrincipal } from '../app/principal.js';
import type { ApiBindings, AppDeps } from '../app/types.js';
import { parseBody, parseQuery } from '../app/validate.js';
import { StoredIssueWriter } from './issue-writer.js';
import { PLATFORM_ISSUE_LABELS, REPORTS_PER_USER_PER_HOUR } from './policy.js';
import { admitRepair } from './repair.js';
import { frameKey, normaliseMessage } from './signature.js';
import {
  findReport,
  listPlatformQueue,
  listReports,
  recordReport,
  setBundleKey,
  setPlatformRef,
  setReportJob,
  setReportRoute,
  type Intake,
} from './store.js';

const BUNDLE_TYPES = new Set(['application/octet-stream', 'application/json', 'application/gzip']);
const BUNDLE_URL_TTL_MS = 5 * 60 * 1000;

type ReportsContext = { perUser: ReturnType<typeof createRateLimiter>; issueWriter: IssueWriter };
const contexts = new WeakMap<AppDeps, ReportsContext>();

export function setup(deps: AppDeps): void {
  contexts.set(deps, {
    perUser: createRateLimiter(REPORTS_PER_USER_PER_HOUR),
    issueWriter: new StoredIssueWriter(deps.db),
  });
}

function context(deps: AppDeps): ReportsContext {
  const found = contexts.get(deps);
  if (!found) throw new Error('reports routes used before setup');
  return found;
}

function gameFor(deps: AppDeps, gameId: string) {
  const game = deps.db.select().from(schema.games).where(eq(schema.games.id, gameId)).get();
  if (!game) throw new HttpError(404, 'game_not_found');
  return game;
}

function requireViewer(actor: Actor, game: { familyId: string; ownerId: string }): void {
  if (game.ownerId === actor.userId && game.familyId === actor.familyId) return;
  requireAuthorization(authorize(actor, 'report.view', { familyId: game.familyId }));
}

// Only redacted, normalised error metadata; never the reporter's text or bundle.
function platformIssue(deps: AppDeps, intake: Intake, error: ReportError) {
  const games =
    deps.db
      .select({ n: countDistinct(schema.reports.gameId) })
      .from(schema.reports)
      .where(eq(schema.reports.platformSignature, intake.signature.signature))
      .get()?.n ?? 1;
  return {
    title: `Platform ${error.type}: ${intake.signature.signature.slice(0, 8)}`,
    body: [
      `Signature ${intake.signature.signature}`,
      `Type ${error.type}`,
      `Message ${normaliseMessage(error.message)}`,
      `Frames ${error.frames.slice(0, 3).map(frameKey).join(', ')}`,
      `Games affected ${games}`,
    ].join('\n'),
    labels: [...PLATFORM_ISSUE_LABELS],
  };
}

const listQuery = z.object({ gameId: Id }).strict();

const routes = new Hono<ApiBindings>()
  .post('/', async (c) => {
    const principal = requirePrincipal(c, ['user']);
    const deps = c.get('deps');
    const actor = actorFromPrincipal(principal);
    if (!context(deps).perUser(actor.userId)) throw new HttpError(429, 'rate_limited');
    const body = await parseBody(c, CreateReport);
    const game = gameFor(deps, body.gameId);
    const resource = {
      gameId: game.id,
      familyId: game.familyId,
      ownerId: game.ownerId,
      visibility: game.visibility,
      granted: hasGameGrant(deps.db, game.id, actor.userId),
    };
    requireAuthorization(authorize(actor, 'game.play', resource));
    requireAuthorization(authorize(actor, 'report.file', resource));

    // A client-supplied bundleKey is ignored: bundles arrive through POST /:id/bundle only.
    const intake = recordReport(deps, {
      body: { ...body, bundleKey: undefined },
      reporterId: actor.userId,
      now: new Date(),
    });
    const { report, signature: sig } = intake;
    const response: CreateReportResponse & { pendingBudget?: true } = {
      reportId: report.id,
      signature: sig.signature,
      route: report.route,
    };

    if (report.route === 'game_repair') {
      if (sig.status === 'open' && sig.openJobId) {
        setReportJob(deps.db, report.id, sig.signature, sig.openJobId);
        response.jobId = sig.openJobId;
      } else {
        let outcome;
        try {
          outcome = await admitRepair(
            {
              db: deps.db,
              sqlite: deps.sqlite,
              events: deps.events,
              defaults: {
                dailyAllowanceMicroUsd: deps.config.defaultDailyAllowanceMicroUsd,
                resetZone: deps.config.resetZoneDefault,
              },
            },
            {
              gameId: game.id,
              ownerId: game.ownerId,
              familyId: game.familyId,
              reportId: report.id,
              releaseId: report.releaseId,
              signature: sig.signature,
              reproduction: report.reproduction,
            },
          );
        } catch (error) {
          deps.log({ event: 'report-repair-admission-failed', reportId: report.id, error: String(error) });
          throw new HttpError(502, 'repair_admission_failed', undefined, { reportId: report.id });
        }
        if (outcome.jobId) {
          setReportJob(deps.db, report.id, sig.signature, outcome.jobId);
          response.jobId = outcome.jobId;
        } else {
          setReportRoute(deps.db, report.id, 'stored');
          response.route = 'stored';
          response.pendingBudget = true;
        }
      }
    } else if (report.route === 'platform' && sig.platformRef === null && body.error) {
      try {
        const { ref } = await context(deps).issueWriter.file(platformIssue(deps, intake, body.error));
        setPlatformRef(deps.db, sig.signature, ref);
      } catch (error) {
        // The signature stays without a ref, so the next matching report files again.
        deps.log({ event: 'report-platform-issue-failed', reportId: report.id, error: String(error) });
      }
    }

    return c.json(response, 201);
  })
  .get('/', (c) => {
    const principal = requirePrincipal(c, ['user']);
    const deps = c.get('deps');
    const { gameId } = parseQuery(c, listQuery);
    requireViewer(actorFromPrincipal(principal), gameFor(deps, gameId));
    return c.json({ reports: listReports(deps.db, gameId) });
  })
  .get('/platform-queue', (c) => {
    const principal = requirePrincipal(c, ['user']);
    requireAuthorization(authorize(actorFromPrincipal(principal), 'report.view'));
    return c.json({ issues: listPlatformQueue(c.get('deps').db) });
  })
  .post('/:id/bundle', async (c) => {
    const principal = requirePrincipal(c, ['user']);
    const deps = c.get('deps');
    const report = findReport(deps.db, c.req.param('id'));
    if (report.reporterId !== principal.userId) throw new HttpError(403, 'not_reporter');
    if (report.bundleKey !== null) throw new HttpError(409, 'bundle_exists');
    const contentType = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!BUNDLE_TYPES.has(contentType)) throw new HttpError(415, 'unsupported_bundle_type');
    const max = deps.config.reportBundleMaxBytes;
    const declared = Number(c.req.header('content-length') ?? '0');
    if (declared > max) throw new HttpError(413, 'bundle_too_large');
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength > max) throw new HttpError(413, 'bundle_too_large');
    if (bytes.byteLength === 0) throw new HttpError(400, 'empty_bundle');

    try {
      const { hash } = await deps.blobStore.put(bytes, contentType);
      setBundleKey(deps.db, report.id, hash);
      return c.json({ reportId: report.id, bundleKey: hash }, 201);
    } catch (error) {
      deps.log({ event: 'report-bundle-store-failed', reportId: report.id, error: String(error) });
      return c.json({ reportId: report.id }, 201);
    }
  })
  .get('/:id/bundle', async (c) => {
    const principal = requirePrincipal(c, ['user']);
    const deps = c.get('deps');
    const report = findReport(deps.db, c.req.param('id'));
    const game = gameFor(deps, report.gameId);
    requireAuthorization(authorize(actorFromPrincipal(principal), 'report.view', { familyId: game.familyId }));
    if (report.bundleKey === null) throw new HttpError(404, 'bundle_not_found');
    const { url } = await deps.blobStore.signedGet(
      report.bundleKey as Parameters<AppDeps['blobStore']['signedGet']>[0],
      new Date(Date.now() + BUNDLE_URL_TTL_MS),
    );
    return c.redirect(url, 302);
  });

export default routes;
