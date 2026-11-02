import { randomUUID } from 'node:crypto';

import { AnalyticsEventSchema } from '@ogm/contracts';
import { schema, type Db } from '@ogm/db';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { pseudoUserId, pseudonymForUser } from './pseudonym.js';

const eventSchema = AnalyticsEventSchema.omit({ gameId: true, pseudoUserId: true });
const eventNames = new Set([
  'session_start',
  'session_end',
  'active_heartbeat',
  'game_load_failed',
  'error',
  'bug_report',
  'update_offered',
  'update_accepted',
  'save',
  'load',
  'attempt_start',
  'attempt_end',
  'marker',
  'complete',
]);
const eventKeys = new Set([
  'ts',
  'branchId',
  'releaseId',
  'env',
  'sessionId',
  'name',
  'scope',
  'marker',
  'outcome',
  'props',
]);
const propKeys = new Set(['device', 'input', 'tier', 'release']);
const propValues = {
  device: new Set(['desktop', 'mobile', 'tablet', 'console']),
  input: new Set(['keyboard', 'pointer', 'touch', 'gamepad', 'network']),
  tier: new Set(['desktop', 'mobile', 'low']),
} as const;

export interface IngestResult {
  accepted: number;
  rejected: number;
  reasons: { index: number; reason: string }[];
}

type PlayEvent = z.infer<typeof eventSchema>;

function hasSafeProps(props: Record<string, unknown>, releaseId: unknown): boolean {
  for (const [key, value] of Object.entries(props)) {
    if (typeof value !== 'string') return false;
    if (key === 'release') {
      if (typeof releaseId !== 'string' || value !== releaseId) return false;
      continue;
    }
    if (key === 'device' || key === 'input' || key === 'tier') {
      if (!propValues[key].has(value)) return false;
    }
  }
  return true;
}

function validateEvent(raw: unknown): { ok: true; event: PlayEvent } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'event_shape' };
  const record = raw as Record<string, unknown>;
  if (Object.keys(record).some((key) => !eventKeys.has(key))) return { ok: false, reason: 'event_key' };

  const props = record.props;
  if (props !== undefined) {
    if (!props || typeof props !== 'object' || Array.isArray(props)) return { ok: false, reason: 'props_shape' };
    if (Object.keys(props).some((key) => !propKeys.has(key))) return { ok: false, reason: 'props_key' };
    if (Buffer.byteLength(JSON.stringify(props), 'utf8') > 1_024) return { ok: false, reason: 'props_too_large' };
    if (!hasSafeProps(props as Record<string, unknown>, record.releaseId)) {
      return { ok: false, reason: 'props_value' };
    }
  }

  const parsed = eventSchema.safeParse(record);
  if (!parsed.success) return { ok: false, reason: 'invalid_event' };
  const event = parsed.data;
  if (!eventNames.has(event.name)) return { ok: false, reason: 'name' };
  if (event.name === 'attempt_start' && event.scope === undefined) return { ok: false, reason: 'scope' };
  if (event.name === 'attempt_end' && (event.scope === undefined || event.outcome === undefined)) {
    return { ok: false, reason: 'attempt_end' };
  }
  if (event.name === 'marker' && event.marker === undefined) return { ok: false, reason: 'marker' };
  return { ok: true, event };
}

export function ingestPlayEvents(db: Db, userId: string, gameId: string, rawEvents: readonly unknown[]): IngestResult {
  const reasons: IngestResult['reasons'] = [];
  const accepted: PlayEvent[] = [];
  for (const [index, raw] of rawEvents.entries()) {
    const result = validateEvent(raw);
    if (result.ok) accepted.push(result.event);
    else reasons.push({ index, reason: result.reason });
  }

  if (accepted.length > 0) {
    const pseudonym = pseudonymForUser(db, gameId, userId);
    db.insert(schema.creatorAnalyticsEvents)
      .values(
        accepted.map((event) => ({
          id: `cae_${randomUUID()}`,
          ts: new Date(event.ts).toISOString(),
          gameId,
          branchId: event.branchId,
          releaseId: event.releaseId,
          env: event.env,
          pseudoUserId: pseudonym,
          sessionId: event.sessionId,
          name: event.name as typeof schema.creatorAnalyticsEvents.$inferInsert.name,
          scope: event.scope,
          marker: event.marker,
          outcome: event.outcome,
          propsJson: JSON.stringify(event.props ?? {}),
        })),
      )
      .run();
  }

  return { accepted: accepted.length, rejected: reasons.length, reasons };
}

export function deleteUserEvents(db: Db, userId: string): number {
  const salts = db.select().from(schema.analyticsSalts).all();
  const pseudonyms = new Map<string, string[]>();
  for (const salt of salts) {
    const values = pseudonyms.get(salt.gameId) ?? [];
    values.push(pseudoUserId(salt.salt, userId));
    pseudonyms.set(salt.gameId, values);
  }

  let deleted = 0;
  db.transaction((tx) => {
    for (const [gameId, ids] of pseudonyms) {
      deleted += tx
        .delete(schema.creatorAnalyticsEvents)
        .where(
          and(
            eq(schema.creatorAnalyticsEvents.gameId, gameId),
            inArray(schema.creatorAnalyticsEvents.pseudoUserId, ids),
          ),
        )
        .run().changes;
    }
  });
  return deleted;
}
