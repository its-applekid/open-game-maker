import { schema, type Db } from '@ogm/db';
import { and, eq, gte, lte } from 'drizzle-orm';

export interface AnalyticsRange {
  from: string;
  to: string;
}

type DailyRow = typeof schema.creatorAnalyticsDaily.$inferSelect;

function rowsFor(db: Db, gameId: string, range: AnalyticsRange): DailyRow[] {
  return db
    .select()
    .from(schema.creatorAnalyticsDaily)
    .where(
      and(
        eq(schema.creatorAnalyticsDaily.gameId, gameId),
        gte(schema.creatorAnalyticsDaily.day, range.from),
        lte(schema.creatorAnalyticsDaily.day, range.to),
      ),
    )
    .all();
}

function sum(rows: DailyRow[], metric: DailyRow['metric'], scope = ''): number {
  return rows
    .filter((row) => row.metric === metric && row.scope === scope)
    .reduce((total, row) => total + row.value, 0);
}

function weightedRate(rows: DailyRow[], metric: DailyRow['metric'], weightMetric: DailyRow['metric']): number {
  const rates = rows.filter((row) => row.metric === metric && row.scope === '');
  let weighted = 0;
  let totalWeight = 0;
  for (const rate of rates) {
    const weight = rows.find(
      (row) =>
        row.day === rate.day && row.releaseId === rate.releaseId && row.metric === weightMetric && row.scope === '',
    )?.value;
    if (weight === undefined) continue;
    weighted += rate.value * weight;
    totalWeight += weight;
  }
  return totalWeight === 0 ? 0 : weighted / totalWeight;
}

export function queryOverview(db: Db, gameId: string, range: AnalyticsRange) {
  const rows = rowsFor(db, gameId, range);
  const aggregate = rows.filter(({ releaseId }) => releaseId === '');
  const releases = new Map<string, DailyRow[]>();
  for (const row of rows) {
    if (!row.releaseId) continue;
    const values = releases.get(row.releaseId) ?? [];
    values.push(row);
    releases.set(row.releaseId, values);
  }
  return {
    plays: sum(aggregate, 'plays'),
    players: sum(aggregate, 'players'),
    medianActiveSec: weightedRate(aggregate, 'median_active_sec', 'plays'),
    completionRate: weightedRate(aggregate, 'completion_rate', 'players'),
    testRuns: sum(aggregate, 'test_runs'),
    byRelease: [...releases].map(([releaseId, releaseRows]) => ({
      releaseId,
      plays: sum(releaseRows, 'plays'),
      players: sum(releaseRows, 'players'),
      medianActiveSec: weightedRate(releaseRows, 'median_active_sec', 'plays'),
      completionRate: weightedRate(releaseRows, 'completion_rate', 'players'),
    })),
  };
}

export function queryFunnel(db: Db, gameId: string, range: AnalyticsRange) {
  const rows = rowsFor(db, gameId, range).filter(({ releaseId }) => releaseId === '');
  const players = sum(rows, 'players');
  const markerCounts = new Map<string, number>();
  const markerFirstSeen = new Map<string, number>();
  const dropCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.metric === 'marker_reached') markerCounts.set(row.scope, (markerCounts.get(row.scope) ?? 0) + row.value);
    if (row.metric === 'marker_first_seen') {
      markerFirstSeen.set(row.scope, Math.min(markerFirstSeen.get(row.scope) ?? Infinity, row.value));
    }
    if (row.metric === 'drop_off') dropCounts.set(row.scope, (dropCounts.get(row.scope) ?? 0) + row.value);
  }
  return {
    markers: [...markerCounts]
      .sort(
        ([left], [right]) =>
          (markerFirstSeen.get(left) ?? Infinity) - (markerFirstSeen.get(right) ?? Infinity) ||
          left.localeCompare(right),
      )
      .map(([marker, reached]) => ({
        marker,
        reached,
        rate: players === 0 ? 0 : reached / players,
      })),
    dropOff: [...dropCounts].map(([marker, count]) => ({ marker, players: count })),
  };
}

export function queryAttempts(db: Db, gameId: string, range: AnalyticsRange) {
  const rows = rowsFor(db, gameId, range).filter(({ releaseId }) => releaseId === '');
  const scopes = new Set(rows.filter(({ metric }) => metric === 'attempts').map(({ scope }) => scope));
  return [...scopes].map((scope) => {
    const attempts = sum(rows, 'attempts', scope);
    const clears = sum(rows, 'clears', scope);
    return {
      scope,
      attempts,
      clears,
      clearRate: attempts === 0 ? 0 : clears / attempts,
      stuck: sum(rows, 'stuck', scope),
    };
  });
}

export function queryReleases(db: Db, gameId: string, range: AnalyticsRange) {
  return queryOverview(db, gameId, range).byRelease;
}
