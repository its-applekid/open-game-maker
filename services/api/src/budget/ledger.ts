import { randomUUID } from 'node:crypto';

import type { Reservation } from '@ogm/contracts';
import { schema, type Db } from '@ogm/db';
import { and, eq } from 'drizzle-orm';

import { HttpError } from '../app/errors.js';
import { dayKey } from './reset.js';

function job(db: Db, jobId: string) {
  const row = db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId)).get();
  if (!row) throw new HttpError(404, 'job_not_found');
  return row;
}

function reservationAmount(raw: string): number {
  return (JSON.parse(raw) as Reservation).amountMicroUsd;
}

function insert(
  db: Db,
  input: {
    familyId: string;
    userId: string;
    jobId: string;
    kind: 'reservation' | 'release' | 'usage' | 'adjustment';
    amountMicroUsd: number;
    at: Date;
    day: string;
    aiurRunId?: string;
    note?: string;
  },
): void {
  db.insert(schema.budgetLedger)
    .values({
      id: `l_${randomUUID()}`,
      familyId: input.familyId,
      userId: input.userId,
      jobId: input.jobId,
      kind: input.kind,
      amountMicroUsd: input.amountMicroUsd,
      at: input.at.toISOString(),
      dayKey: input.day,
      aiurRunId: input.aiurRunId,
      note: input.note,
    })
    .run();
}

export function reserve(input: {
  db: Db;
  jobId: string;
  at: Date;
  zone: string;
  amountMicroUsd?: number;
  forDay?: string;
}): number {
  const row = job(input.db, input.jobId);
  const day = input.forDay ?? dayKey(input.at, input.zone);
  const existing = input.db
    .select()
    .from(schema.budgetLedger)
    .where(and(eq(schema.budgetLedger.jobId, input.jobId), eq(schema.budgetLedger.kind, 'reservation')))
    .get();
  if (existing) return existing.amountMicroUsd;
  const amount = input.amountMicroUsd ?? reservationAmount(row.reservation);
  insert(input.db, {
    familyId: row.familyId,
    userId: row.creatorId,
    jobId: row.id,
    kind: 'reservation',
    amountMicroUsd: amount,
    at: input.at,
    day,
  });
  return amount;
}

export function recordUsage(input: {
  db: Db;
  jobId: string;
  microUsd: number;
  runId: string;
  at: Date;
  zone: string;
}): number {
  const row = job(input.db, input.jobId);
  return input.db.transaction((tx) => {
    const previous = tx
      .select()
      .from(schema.budgetLedger)
      .where(
        and(
          eq(schema.budgetLedger.jobId, input.jobId),
          eq(schema.budgetLedger.kind, 'usage'),
          eq(schema.budgetLedger.aiurRunId, input.runId),
        ),
      )
      .all()
      .reduce((total, entry) => total + entry.amountMicroUsd, 0);
    const delta = Math.max(0, input.microUsd - previous);
    if (delta === 0) return 0;

    tx.insert(schema.budgetLedger)
      .values({
        id: `l_${randomUUID()}`,
        familyId: row.familyId,
        userId: row.creatorId,
        jobId: row.id,
        kind: 'usage',
        amountMicroUsd: delta,
        at: input.at.toISOString(),
        dayKey: dayKey(input.at, input.zone),
        aiurRunId: input.runId,
      })
      .run();
    const usageMicroUsd = tx
      .select()
      .from(schema.budgetLedger)
      .where(and(eq(schema.budgetLedger.jobId, input.jobId), eq(schema.budgetLedger.kind, 'usage')))
      .all()
      .reduce((total, entry) => total + entry.amountMicroUsd, 0);
    tx.update(schema.jobs)
      .set({ usageMicroUsd, updatedAt: input.at.toISOString() })
      .where(eq(schema.jobs.id, input.jobId))
      .run();
    return delta;
  });
}

export function releaseReservation(input: { db: Db; jobId: string; at: Date; zone: string }): number {
  const row = job(input.db, input.jobId);
  const ledger = input.db.select().from(schema.budgetLedger).where(eq(schema.budgetLedger.jobId, input.jobId)).all();
  const reserved = ledger
    .filter((entry) => entry.kind === 'reservation')
    .reduce((sum, entry) => sum + entry.amountMicroUsd, 0);
  const released = ledger
    .filter((entry) => entry.kind === 'release')
    .reduce((sum, entry) => sum + entry.amountMicroUsd, 0);
  const unused = Math.max(0, reserved - Math.min(row.usageMicroUsd, reserved) - released);
  if (unused === 0) return 0;
  const reservationDay = ledger.find((entry) => entry.kind === 'reservation')?.dayKey ?? dayKey(input.at, input.zone);
  insert(input.db, {
    familyId: row.familyId,
    userId: row.creatorId,
    jobId: row.id,
    kind: 'release',
    amountMicroUsd: unused,
    at: input.at,
    day: reservationDay,
  });
  return unused;
}

export function recordAdjustment(input: {
  db: Db;
  jobId: string;
  amountMicroUsd: number;
  note: string;
  at: Date;
  zone: string;
}): void {
  if (input.amountMicroUsd === 0) return;
  const row = job(input.db, input.jobId);
  insert(input.db, {
    familyId: row.familyId,
    userId: row.creatorId,
    jobId: row.id,
    kind: 'adjustment',
    amountMicroUsd: input.amountMicroUsd,
    at: input.at,
    day: dayKey(input.at, input.zone),
    note: input.note,
  });
}
