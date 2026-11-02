import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadEnv } from '@ogm/config';
import { migrate, openDb, schema, type Db } from '@ogm/db';
import { and, eq, gte, lt } from 'drizzle-orm';

import { pruneExpiredSalts, rotateDueSalts } from './pseudonym.js';

type EventRow = typeof schema.creatorAnalyticsEvents.$inferSelect;
type DailyInsert = typeof schema.creatorAnalyticsDaily.$inferInsert;
type DailyMetric = DailyInsert['metric'];

export interface RollupResult {
  day: string;
  games: number;
  rows: number;
  deletedEvents: number;
  prunedSalts: number;
  rotatedSalts: number;
  dryRun: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function increment(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function metricsFor(gameId: string, day: string, releaseId: string, events: EventRow[]): DailyInsert[] {
  const rows = new Map<string, DailyInsert>();
  const add = (metric: DailyMetric, value: number, scope = '') => {
    rows.set(`${metric}\u0000${scope}`, { gameId, day, releaseId, metric, scope, value });
  };
  const starts = events.filter(({ name }) => name === 'session_start');
  const sessions = new Set(starts.map(({ sessionId }) => sessionId));
  const players = new Set(starts.map(({ pseudoUserId }) => pseudoUserId));
  const completed = new Set(
    events
      .filter(({ name, pseudoUserId }) => name === 'complete' && players.has(pseudoUserId))
      .map(({ pseudoUserId }) => pseudoUserId),
  );
  const heartbeatBySession = new Map<string, number>();
  const attempts = new Map<string, number>();
  const clears = new Map<string, number>();
  const markerUsers = new Map<string, Set<string>>();
  const markerFirstSeen = new Map<string, number>();
  const lastMarker = new Map<string, EventRow>();
  const failCounts = new Map<string, number>();
  const stuckUsers = new Map<string, Set<string>>();

  for (const event of [...events].sort((left, right) => left.ts.localeCompare(right.ts))) {
    if (event.name === 'active_heartbeat') increment(heartbeatBySession, event.sessionId);
    if (event.name === 'attempt_start' && event.scope) increment(attempts, event.scope);
    if (event.name === 'attempt_end' && event.scope && event.outcome === 'complete') increment(clears, event.scope);
    if (event.name === 'attempt_end' && event.scope && event.outcome === 'fail') {
      increment(failCounts, `${event.pseudoUserId}\u0000${event.scope}`);
    }
    if (event.name === 'marker' && event.marker && players.has(event.pseudoUserId)) {
      const users = markerUsers.get(event.marker) ?? new Set<string>();
      users.add(event.pseudoUserId);
      markerUsers.set(event.marker, users);
      markerFirstSeen.set(event.marker, Math.min(markerFirstSeen.get(event.marker) ?? Infinity, Date.parse(event.ts)));
      lastMarker.set(event.pseudoUserId, event);
    }
  }

  for (const [key, count] of failCounts) {
    if (count < 5) continue;
    const [pseudo, scope] = key.split('\u0000') as [string, string];
    const users = stuckUsers.get(scope) ?? new Set<string>();
    users.add(pseudo);
    stuckUsers.set(scope, users);
  }

  const sessionEvents = new Map<string, EventRow[]>();
  for (const event of events) {
    const values = sessionEvents.get(event.sessionId) ?? [];
    values.push(event);
    sessionEvents.set(event.sessionId, values);
  }
  for (const values of sessionEvents.values()) {
    values.sort((left, right) => left.ts.localeCompare(right.ts));
    let lastMarkerIndex = -1;
    let scope: string | null = null;
    for (let index = 0; index < values.length; index += 1) {
      const event = values[index]!;
      if (event.name === 'marker') lastMarkerIndex = index;
      if (event.scope) scope = event.scope;
    }
    const heartbeats = values.slice(lastMarkerIndex + 1).filter(({ name }) => name === 'active_heartbeat').length;
    if (heartbeats < 20) continue;
    const pseudo = values[0]?.pseudoUserId;
    if (!scope || !pseudo) continue;
    const users = stuckUsers.get(scope) ?? new Set<string>();
    users.add(pseudo);
    stuckUsers.set(scope, users);
  }

  add('plays', sessions.size);
  add('players', players.size);
  add('median_active_sec', median([...sessions].map((sessionId) => (heartbeatBySession.get(sessionId) ?? 0) * 30)));
  add('completion_rate', players.size === 0 ? 0 : completed.size / players.size);
  for (const [scope, count] of attempts) {
    const clearCount = clears.get(scope) ?? 0;
    add('attempts', count, scope);
    add('clears', clearCount, scope);
    add('clear_rate', count === 0 ? 0 : clearCount / count, scope);
  }
  for (const [marker, users] of markerUsers) {
    add('marker_reached', users.size, marker);
    add('marker_first_seen', markerFirstSeen.get(marker)!, marker);
  }
  const dropOff = new Map<string, number>();
  for (const [pseudo, marker] of lastMarker) {
    if (!completed.has(pseudo) && marker.marker) increment(dropOff, marker.marker);
  }
  for (const [marker, count] of dropOff) add('drop_off', count, marker);
  for (const [scope, users] of stuckUsers) add('stuck', users.size, scope);
  return [...rows.values()];
}

function buildRows(day: string, events: EventRow[]): DailyInsert[] {
  const byGame = new Map<string, EventRow[]>();
  for (const event of events) {
    const values = byGame.get(event.gameId) ?? [];
    values.push(event);
    byGame.set(event.gameId, values);
  }

  const rows: DailyInsert[] = [];
  for (const [gameId, gameEvents] of byGame) {
    const published = gameEvents.filter(({ env }) => env === 'published');
    rows.push(...metricsFor(gameId, day, '', published));
    const byRelease = new Map<string, EventRow[]>();
    for (const event of published) {
      const releaseId = event.releaseId ?? '';
      if (!releaseId) continue;
      const values = byRelease.get(releaseId) ?? [];
      values.push(event);
      byRelease.set(releaseId, values);
    }
    for (const [releaseId, releaseEvents] of byRelease) {
      const releaseRows = metricsFor(gameId, day, releaseId, releaseEvents);
      rows.push(...releaseRows);
      const plays = releaseRows.find(({ metric, scope }) => metric === 'plays' && scope === '')?.value ?? 0;
      rows.push({ gameId, day, releaseId: '', metric: 'version_adoption', scope: releaseId, value: plays });
    }
    const testRuns = new Set(
      gameEvents
        .filter(({ env, name }) => env === 'draft' && name === 'session_start')
        .map(({ sessionId }) => sessionId),
    ).size;
    rows.push({ gameId, day, releaseId: '', metric: 'test_runs', scope: '', value: testRuns });
  }
  return rows;
}

export function rollup(
  db: Db,
  day: string,
  options: { now?: string; dryRun?: boolean; retentionDays?: number } = {},
): RollupResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new TypeError('rollup day must use YYYY-MM-DD');
  const now = options.now ?? new Date().toISOString();
  const retentionDays = options.retentionDays ?? 90;
  if (!Number.isSafeInteger(retentionDays) || retentionDays <= 0) {
    throw new TypeError('retentionDays must be a positive safe integer');
  }
  const cutoff = new Date(Date.parse(now) - retentionDays * DAY_MS).toISOString();
  const start = `${day}T00:00:00.000Z`;
  const end = new Date(Date.parse(start) + DAY_MS).toISOString();
  if (options.dryRun !== true && start < cutoff) {
    throw new RangeError('rollup day is outside the raw-event retention window');
  }
  const events = db
    .select()
    .from(schema.creatorAnalyticsEvents)
    .where(and(gte(schema.creatorAnalyticsEvents.ts, start), lt(schema.creatorAnalyticsEvents.ts, end)))
    .all();
  const rows = buildRows(day, events);
  const games = new Set(events.map(({ gameId }) => gameId)).size;
  if (options.dryRun === true) {
    return { day, games, rows: rows.length, deletedEvents: 0, prunedSalts: 0, rotatedSalts: 0, dryRun: true };
  }

  db.transaction((tx) => {
    tx.delete(schema.creatorAnalyticsDaily).where(eq(schema.creatorAnalyticsDaily.day, day)).run();
    if (rows.length > 0) tx.insert(schema.creatorAnalyticsDaily).values(rows).run();
  });

  const deletedEvents = db
    .delete(schema.creatorAnalyticsEvents)
    .where(lt(schema.creatorAnalyticsEvents.ts, cutoff))
    .run().changes;
  const prunedSalts = pruneExpiredSalts(db, cutoff);
  const rotatedSalts = rotateDueSalts(db, now);
  return { day, games, rows: rows.length, deletedEvents, prunedSalts, rotatedSalts, dryRun: false };
}

function previousUtcDay(now = new Date()): string {
  return new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10);
}

export function main(argv = process.argv.slice(2)): void {
  const env = loadEnv('api-rollup', {
    OGM_DATA_DIR: { kind: 'path' },
    OGM_ANALYTICS_RETENTION_DAYS: { kind: 'int', default: '90' },
  });
  const { sqlite, db } = openDb(join(env.OGM_DATA_DIR, 'ogm.sqlite3'));
  try {
    migrate({ sqlite });
    const dayArg = argv.find((argument) => argument.startsWith('--day='));
    const result = rollup(db, dayArg?.slice('--day='.length) || previousUtcDay(), {
      dryRun: argv.includes('--dry-run'),
      retentionDays: env.OGM_ANALYTICS_RETENTION_DAYS,
    });
    console.log(JSON.stringify(result));
  } finally {
    sqlite.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
