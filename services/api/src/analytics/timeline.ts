import {
  ActivityMeta,
  BuildTimeline,
  type Activity,
  type ActivityEvent,
  type BuildTimeline as BuildTimelineValue,
  type Principal,
} from '@ogm/contracts';
import type { Sqlite } from '@ogm/db';

import { HttpError } from '../app/errors.js';
import { requireAnalyticsAdmin } from './authorization.js';
import { findOptionalJob } from './jobs.js';

export type ActivityRow = {
  id: string;
  ts: string;
  jobId: string | null;
  gameId: string;
  familyId: string;
  principalKind: 'job' | 'user';
  principalId: string;
  actor: 'agent' | 'human';
  activity: Activity;
  boundary: 'start' | 'end' | 'point';
  source: ActivityEvent['source'];
  metaJson: string;
};

export type PairedActivity = BuildTimelineValue['activities'][number];

function activityKey(row: ActivityRow): string {
  return [row.activity, row.actor, row.source].join('\u0000');
}

function paired(row: ActivityRow, endedAt: string | null): PairedActivity {
  return {
    activity: row.activity,
    actor: row.actor,
    source: row.source,
    startedAt: row.ts,
    endedAt,
    meta: ActivityMeta.parse(JSON.parse(row.metaJson)),
  };
}

export function pairActivities(rows: readonly ActivityRow[]): PairedActivity[] {
  const starts = new Map<string, ActivityRow>();
  const result: PairedActivity[] = [];

  for (const row of [...rows].sort(
    (left, right) => left.ts.localeCompare(right.ts) || left.id.localeCompare(right.id),
  )) {
    const key = activityKey(row);
    const start = starts.get(key);
    if (row.boundary === 'start') {
      if (start) result.push(paired(start, row.ts));
      starts.set(key, row);
    } else if (row.boundary === 'end') {
      result.push(start ? paired(start, row.ts) : paired(row, row.ts));
      starts.delete(key);
    } else {
      result.push(paired(row, row.ts));
    }
  }

  for (const start of starts.values()) result.push(paired(start, null));
  return result.sort(
    (left, right) =>
      left.startedAt.localeCompare(right.startedAt) || (left.endedAt ?? '').localeCompare(right.endedAt ?? ''),
  );
}

function eventFamily(sqlite: Sqlite, jobId: string): string | null {
  const rows = sqlite
    .prepare<[string], { family_id: string }>(
      'SELECT DISTINCT family_id FROM activity_events WHERE job_id = ? ORDER BY family_id LIMIT 2',
    )
    .all(jobId);
  if (rows.length > 1) throw new HttpError(403, 'forbidden');
  return rows[0]?.family_id ?? null;
}

export function buildTimeline(input: {
  sqlite: Sqlite;
  principal: Extract<Principal, { kind: 'user' }>;
  jobId: string;
  now?: Date;
}): BuildTimelineValue {
  requireAnalyticsAdmin(input.principal);
  const job = findOptionalJob(input.sqlite, input.jobId);
  const familyId = job?.familyId ?? eventFamily(input.sqlite, input.jobId);
  if (!familyId) throw new HttpError(404, 'not_found');
  if (familyId !== input.principal.familyId) throw new HttpError(403, 'forbidden');

  const eventRows = input.sqlite
    .prepare<[string, string], ActivityRow>(
      `SELECT id, ts, job_id AS jobId, game_id AS gameId, family_id AS familyId,
              principal_kind AS principalKind, principal_id AS principalId, actor, activity,
              boundary, source, meta_json AS metaJson
       FROM activity_events WHERE job_id = ? AND family_id = ? ORDER BY ts, id`,
    )
    .all(input.jobId, familyId);
  const phases = input.sqlite
    .prepare<
      [string],
      { phase: BuildTimelineValue['aiur']['phases'][number]['phase']; at: string; transition: string | null }
    >('SELECT phase, at, transition FROM aiur_phase_events WHERE job_id = ? ORDER BY at')
    .all(input.jobId)
    .map(({ transition, ...phase }) => (transition === null ? phase : { ...phase, transition }));

  const retries = job
    ? Number(
        input.sqlite
          .prepare<[string, string], { count: number }>(
            'SELECT count(*) AS count FROM aiur_phase_events WHERE job_id = ? AND transition = ?',
          )
          .get(input.jobId, 'rework')?.count ?? 0,
      )
    : null;

  return BuildTimeline.parse({
    jobId: input.jobId,
    aiur: { phases, usageMicroUsd: job?.usageMicroUsd ?? null, retries },
    activities: pairActivities(eventRows),
    generatedAt: (input.now ?? new Date()).toISOString(),
  });
}
