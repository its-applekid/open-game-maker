import { JobPlan, Reservation, type CreateJobAccepted, type Job, type JobState } from '@ogm/contracts';
import { schema, type Db } from '@ogm/db';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { HttpError } from '../app/errors.js';
import { SLOT_STATES } from './state.js';

export type JobRow = typeof schema.jobs.$inferSelect;

export function toJob(row: JobRow, projection?: typeof schema.jobProjections.$inferSelect | null): Job {
  return {
    id: row.id,
    gameId: row.gameId,
    branchId: row.branchId,
    familyId: row.familyId,
    creatorId: row.creatorId,
    kind: row.kind,
    complexity: row.complexity,
    state: row.state,
    pausedReason: row.pausedReason,
    start: row.start,
    startAt: row.startAt,
    slot: row.slot,
    plan: JobPlan.parse(JSON.parse(row.plan)),
    reservation: Reservation.parse(JSON.parse(row.reservation)),
    hardCapMicroUsd: row.hardCapMicroUsd,
    usageMicroUsd: row.usageMicroUsd,
    aiurRepo: row.aiurRepo,
    aiurIssueNumber: row.aiurIssueNumber,
    aiurSpendCapMicroUsd: row.aiurSpendCapMicroUsd,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    terminalAt: row.terminalAt,
    ...(projection ? { stage: projection.stage as Job['stage'], stageText: projection.stageText } : {}),
    ...(projection?.phase ? { phase: projection.phase as Job['phase'] } : {}),
    ...(projection?.progressPercent === null || projection?.progressPercent === undefined
      ? {}
      : { progressPercent: projection.progressPercent }),
  };
}

export function findJobRow(db: Db, id: string): JobRow {
  const row = db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).get();
  if (!row) throw new HttpError(404, 'job_not_found');
  return row;
}

export function findJob(db: Db, id: string): Job {
  const found = db
    .select({ job: schema.jobs, projection: schema.jobProjections })
    .from(schema.jobs)
    .leftJoin(schema.jobProjections, eq(schema.jobs.id, schema.jobProjections.jobId))
    .where(eq(schema.jobs.id, id))
    .get();
  if (!found) throw new HttpError(404, 'job_not_found');
  return toJob(found.job, found.projection);
}

export function listJobs(db: Db, gameId: string): Job[] {
  return db
    .select({ job: schema.jobs, projection: schema.jobProjections })
    .from(schema.jobs)
    .leftJoin(schema.jobProjections, eq(schema.jobs.id, schema.jobProjections.jobId))
    .where(eq(schema.jobs.gameId, gameId))
    .orderBy(asc(schema.jobs.createdAt))
    .all()
    .map(({ job, projection }) => toJob(job, projection));
}

export function acceptedFor(db: Db, row: JobRow): CreateJobAccepted {
  const reservation = Reservation.parse(JSON.parse(row.reservation));
  if (row.state !== 'queued') return { jobId: row.id, state: 'admitted', reservation, slot: row.slot };
  const position =
    db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.familyId, row.familyId),
          eq(schema.jobs.state, 'queued'),
          eq(schema.jobs.slot, row.slot),
          eq(schema.jobs.start, row.start),
        ),
      )
      .orderBy(asc(schema.jobs.createdAt), sql`rowid`)
      .all()
      .findIndex(({ id }) => id === row.id) + 1;
  return { jobId: row.id, state: row.state, reservation, slot: row.slot, position: Math.max(1, position) };
}

export function byTicket(db: Db, daemonSlug: string, ticket: string): { id: string; state: JobState } | null {
  const issueNumber = Number(ticket);
  if (!Number.isSafeInteger(issueNumber)) return null;
  const found = db
    .select({ id: schema.jobs.id, state: schema.jobs.state })
    .from(schema.gameDaemons)
    .innerJoin(
      schema.jobs,
      and(eq(schema.jobs.aiurRepo, schema.gameDaemons.repo), eq(schema.jobs.aiurIssueNumber, issueNumber)),
    )
    .where(eq(schema.gameDaemons.slug, daemonSlug))
    .get();
  return found ?? null;
}

const NON_TERMINAL_STATES: JobState[] = ['queued', 'admitted', 'filed', 'running', 'paused_budget'];

export function activeJobs(db: Db, daemonSlug: string): { jobId: string; ticket: string }[] {
  return db
    .select({ jobId: schema.jobs.id, issueNumber: schema.jobs.aiurIssueNumber })
    .from(schema.gameDaemons)
    .innerJoin(schema.jobs, eq(schema.jobs.aiurRepo, schema.gameDaemons.repo))
    .where(and(eq(schema.gameDaemons.slug, daemonSlug), inArray(schema.jobs.state, NON_TERMINAL_STATES)))
    .orderBy(asc(schema.jobs.aiurIssueNumber), asc(schema.jobs.id))
    .all()
    .filter((row): row is { jobId: string; issueNumber: number } => row.issueNumber !== null)
    .map(({ jobId, issueNumber }) => ({ jobId, ticket: String(issueNumber) }));
}

export function activeJobsForRepo(db: Db, repo: string): { kind: 'new_game' | 'feature' | 'repair' }[] {
  return db
    .select({ kind: schema.jobs.kind })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.aiurRepo, repo), inArray(schema.jobs.state, SLOT_STATES), isNull(schema.jobs.releasedAt)))
    .all()
    .map(({ kind }) => ({ kind: kind === 'scope' ? ('feature' as const) : kind }));
}
