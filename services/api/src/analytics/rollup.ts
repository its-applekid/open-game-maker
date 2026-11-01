import { z } from 'zod';

import { Activity, Id, IsoTime, Rollup, type Principal, type Rollup as RollupValue } from '@ogm/contracts';
import type { Sqlite } from '@ogm/db';

import { HttpError } from '../app/errors.js';
import { resolveGame, type Registry } from '../app/registry.js';
import { requireAnalyticsAdmin } from './authorization.js';
import { optionalGameUsage, optionalJobsForCreator } from './jobs.js';
import { pairActivities, type ActivityRow } from './timeline.js';

export const RollupQuery = z
  .object({
    scope: z.enum(['game', 'member']),
    id: Id,
    from: IsoTime,
    to: IsoTime,
  })
  .strict();

export type RollupQuery = z.output<typeof RollupQuery>;

const activityColumns = `id, ts, job_id AS jobId, game_id AS gameId, family_id AS familyId,
  principal_kind AS principalKind, principal_id AS principalId, actor, activity,
  boundary, source, meta_json AS metaJson`;

function rowsForGame(
  sqlite: Sqlite,
  input: { familyId: string; gameId: string; from: string; to: string },
): ActivityRow[] {
  return sqlite
    .prepare<[string, string, string, string], ActivityRow>(
      `SELECT ${activityColumns} FROM activity_events
       WHERE family_id = ? AND game_id = ? AND ts >= ? AND ts <= ? ORDER BY ts, id`,
    )
    .all(input.familyId, input.gameId, input.from, input.to);
}

function rowsForMember(
  sqlite: Sqlite,
  input: { familyId: string; memberId: string; from: string; to: string; jobsAvailable: boolean },
): ActivityRow[] {
  const ownership = input.jobsAvailable
    ? `(principal_kind = 'user' AND principal_id = ?)
       OR job_id IN (SELECT id FROM jobs WHERE family_id = ? AND creator_id = ?)`
    : `principal_kind = 'user' AND principal_id = ?`;
  const parameters = input.jobsAvailable
    ? [input.familyId, input.from, input.to, input.memberId, input.familyId, input.memberId]
    : [input.familyId, input.from, input.to, input.memberId];
  return sqlite
    .prepare(
      `SELECT ${activityColumns} FROM activity_events
       WHERE family_id = ? AND ts >= ? AND ts <= ? AND (${ownership}) ORDER BY ts, id`,
    )
    .all(...parameters) as ActivityRow[];
}

function groupedActivities(rows: ActivityRow[]) {
  const groups = new Map<string, ActivityRow[]>();
  for (const row of rows) {
    const key = row.jobId ?? `user:${row.principalId}:${row.gameId}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap(pairActivities);
}

export async function buildRollup(input: {
  sqlite: Sqlite;
  registry: Registry;
  principal: Extract<Principal, { kind: 'user' }>;
  query: RollupQuery;
}): Promise<RollupValue> {
  requireAnalyticsAdmin(input.principal);
  const from = new Date(input.query.from).toISOString();
  const to = new Date(input.query.to).toISOString();
  if (from > to) throw new HttpError(400, 'invalid_range');

  let rows: ActivityRow[];
  let usageMicroUsd: number | null;
  if (input.query.scope === 'game') {
    const game = await resolveGame(input.registry, input.query.id);
    if (!game || game.familyId !== input.principal.familyId) throw new HttpError(403, 'game_unresolved');
    rows = rowsForGame(input.sqlite, {
      familyId: input.principal.familyId,
      gameId: input.query.id,
      from,
      to,
    });
    usageMicroUsd = optionalGameUsage(input.sqlite, {
      familyId: input.principal.familyId,
      gameId: input.query.id,
      from,
      to,
    });
  } else {
    const memberJobs = optionalJobsForCreator(input.sqlite, input.principal.familyId, input.query.id);
    rows = rowsForMember(input.sqlite, {
      familyId: input.principal.familyId,
      memberId: input.query.id,
      from,
      to,
      jobsAvailable: memberJobs !== null,
    });
    const representedJobIds = new Set(rows.flatMap(({ jobId }) => (jobId ? [jobId] : [])));
    usageMicroUsd =
      memberJobs === null
        ? null
        : memberJobs
            .filter(({ id }) => representedJobIds.has(id))
            .reduce((total, { usageMicroUsd: usage }) => total + usage, 0);
  }

  const byActivity = Object.fromEntries(
    Activity.options.map((activity) => [activity, { count: 0, durationMs: 0 }]),
  ) as RollupValue['byActivity'];
  for (const activity of groupedActivities(rows)) {
    if (activity.endedAt === null) continue;
    const bucket = byActivity[activity.activity];
    bucket.count += 1;
    bucket.durationMs += Date.parse(activity.endedAt) - Date.parse(activity.startedAt);
  }

  const representedJobIds = new Set(rows.flatMap(({ jobId }) => (jobId ? [jobId] : [])));
  return Rollup.parse({
    scope: input.query.scope,
    id: input.query.id,
    from,
    to,
    builds: representedJobIds.size,
    usageMicroUsd,
    byActivity,
  });
}
