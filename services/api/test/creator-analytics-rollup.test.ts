import { schema } from '@ogm/db';
import { describe, expect, it } from 'vitest';

import { ingestPlayEvents } from '../src/creator-analytics/ingest.js';
import { queryAttempts, queryFunnel, queryOverview } from '../src/creator-analytics/query.js';
import { rollup } from '../src/creator-analytics/rollup.js';
import { makeDeps } from './helpers.js';

const day = '2026-11-01';
const now = '2026-11-02T03:00:00.000Z';
const branchId = 'branch_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const releaseId = 'release_01ARZ3NDEKTSV4RRFFQ69G5FAV';

function seedGame(deps: ReturnType<typeof makeDeps>) {
  deps.db
    .insert(schema.families)
    .values({ id: 'f-rollup', name: 'Family', ownerUserId: 'u-owner', createdAt: now })
    .run();
  deps.db
    .insert(schema.games)
    .values({
      id: 'g-rollup',
      familyId: 'f-rollup',
      ownerId: 'u-owner',
      title: 'Rollup',
      visibility: 'listed',
      repoVisibility: 'private',
      createdAt: now,
    })
    .run();
}

function event(
  sessionId: string,
  name: string,
  overrides: { ts?: string; env?: 'draft' | 'published'; scope?: string; marker?: string; outcome?: string } = {},
) {
  return {
    ts: overrides.ts ?? `${day}T12:00:00.000Z`,
    branchId,
    releaseId,
    env: overrides.env ?? 'published',
    sessionId,
    name,
    ...(overrides.scope ? { scope: overrides.scope } : {}),
    ...(overrides.marker ? { marker: overrides.marker } : {}),
    ...(overrides.outcome ? { outcome: overrides.outcome } : {}),
  };
}

describe('creator analytics rollup', () => {
  it('computes published metrics, drop-off and stuck while retaining daily rows', () => {
    const deps = makeDeps();
    seedGame(deps);
    const playerOne = [
      event('s1', 'session_start'),
      event('s1', 'marker', { marker: 'castle-gate', ts: `${day}T12:02:00.000Z` }),
      event('s1', 'active_heartbeat', { ts: `${day}T12:03:00.000Z` }),
      event('s1', 'active_heartbeat', { ts: `${day}T12:04:00.000Z` }),
    ];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      playerOne.push(event('s1', 'attempt_start', { scope: 'level-3' }));
      playerOne.push(event('s1', 'attempt_end', { scope: 'level-3', marker: 'castle-gate', outcome: 'fail' }));
    }
    ingestPlayEvents(deps.db, 'u-one', 'g-rollup', playerOne);
    ingestPlayEvents(deps.db, 'u-two', 'g-rollup', [
      event('s2', 'session_start'),
      event('s2', 'marker', { marker: 'tower', ts: `${day}T12:01:00.000Z` }),
      event('s2', 'complete'),
      event('s3', 'session_start'),
    ]);
    ingestPlayEvents(deps.db, 'u-stray', 'g-rollup', [
      event('stray', 'marker', { marker: 'not-a-player' }),
      event('stray', 'complete'),
    ]);
    ingestPlayEvents(deps.db, 'u-owner', 'g-rollup', [event('draft', 'session_start', { env: 'draft' })]);

    deps.db
      .insert(schema.creatorAnalyticsEvents)
      .values({
        id: 'old-event',
        ts: '2026-07-01T00:00:00.000Z',
        gameId: 'g-rollup',
        branchId,
        releaseId,
        env: 'published',
        pseudoUserId: 'a'.repeat(64),
        sessionId: 'old',
        name: 'session_start',
        propsJson: '{}',
      })
      .run();
    deps.db
      .insert(schema.creatorAnalyticsDaily)
      .values({ gameId: 'g-rollup', day: '2026-07-01', metric: 'plays', value: 1 })
      .run();

    const first = rollup(deps.db, day, { now });
    expect(first).toMatchObject({ games: 1, deletedEvents: 1, rotatedSalts: 0, dryRun: false });
    expect(queryOverview(deps.db, 'g-rollup', { from: day, to: day })).toMatchObject({
      plays: 3,
      players: 2,
      medianActiveSec: 0,
      completionRate: 0.5,
      testRuns: 1,
    });
    expect(queryAttempts(deps.db, 'g-rollup', { from: day, to: day })).toEqual([
      { scope: 'level-3', attempts: 5, clears: 0, clearRate: 0, stuck: 1 },
    ]);
    expect(queryFunnel(deps.db, 'g-rollup', { from: day, to: day })).toEqual({
      markers: [
        { marker: 'tower', reached: 1, rate: 0.5 },
        { marker: 'castle-gate', reached: 1, rate: 0.5 },
      ],
      dropOff: [{ marker: 'castle-gate', players: 1 }],
    });
    expect(deps.db.select().from(schema.creatorAnalyticsDaily).all()).toContainEqual(
      expect.objectContaining({ day: '2026-07-01', metric: 'plays', value: 1 }),
    );

    const rowCount = deps.db.select().from(schema.creatorAnalyticsDaily).all().length;
    expect(rollup(deps.db, day, { now }).rows).toBe(first.rows);
    expect(deps.db.select().from(schema.creatorAnalyticsDaily).all()).toHaveLength(rowCount);
  });

  it('supports a dry run without mutating daily or raw storage', () => {
    const deps = makeDeps();
    seedGame(deps);
    ingestPlayEvents(deps.db, 'u-one', 'g-rollup', [event('s1', 'session_start')]);

    expect(rollup(deps.db, day, { now, dryRun: true })).toMatchObject({
      games: 1,
      rows: expect.any(Number),
      dryRun: true,
    });
    expect(deps.db.select().from(schema.creatorAnalyticsDaily).all()).toEqual([]);
    expect(deps.db.select().from(schema.creatorAnalyticsEvents).all()).toHaveLength(1);
  });

  it('rejects historical rebuilds after raw retention without erasing daily rows', () => {
    const deps = makeDeps();
    seedGame(deps);
    deps.db
      .insert(schema.creatorAnalyticsDaily)
      .values({ gameId: 'g-rollup', day: '2026-07-01', metric: 'plays', value: 7 })
      .run();

    expect(() => rollup(deps.db, '2026-07-01', { now })).toThrow(/outside the raw-event retention window/);
    expect(deps.db.select().from(schema.creatorAnalyticsDaily).all()).toEqual([
      expect.objectContaining({ day: '2026-07-01', metric: 'plays', value: 7 }),
    ]);
  });

  it('rejects a rebuild when retention has removed only the start of the day', () => {
    const deps = makeDeps();
    seedGame(deps);
    deps.db
      .insert(schema.creatorAnalyticsDaily)
      .values({ gameId: 'g-rollup', day: '2026-08-04', metric: 'plays', value: 3 })
      .run();

    expect(() => rollup(deps.db, '2026-08-04', { now })).toThrow(/outside the raw-event retention window/);
    expect(deps.db.select().from(schema.creatorAnalyticsDaily).all()).toEqual([
      expect.objectContaining({ day: '2026-08-04', metric: 'plays', value: 3 }),
    ]);
  });

  it('rejects invalid retention before mutating raw or daily storage', () => {
    const deps = makeDeps();
    seedGame(deps);
    ingestPlayEvents(deps.db, 'u-one', 'g-rollup', [event('s1', 'session_start')]);

    expect(() => rollup(deps.db, day, { now, retentionDays: 0 })).toThrow(/positive safe integer/);
    expect(deps.db.select().from(schema.creatorAnalyticsDaily).all()).toEqual([]);
    expect(deps.db.select().from(schema.creatorAnalyticsEvents).all()).toHaveLength(1);
  });

  it('prunes only salt generations whose raw-event window has closed', () => {
    const deps = makeDeps();
    seedGame(deps);
    deps.db
      .insert(schema.analyticsSalts)
      .values([
        { gameId: 'g-rollup', salt: '1'.repeat(64), rotatedAt: '2026-06-01T00:00:00.000Z' },
        { gameId: 'g-rollup', salt: '2'.repeat(64), rotatedAt: '2026-07-01T00:00:00.000Z' },
        { gameId: 'g-rollup', salt: '3'.repeat(64), rotatedAt: '2026-10-15T00:00:00.000Z' },
      ])
      .run();

    expect(rollup(deps.db, day, { now })).toMatchObject({ prunedSalts: 1, rotatedSalts: 0 });
    expect(
      deps.db
        .select()
        .from(schema.analyticsSalts)
        .all()
        .map(({ salt }) => salt),
    ).toEqual(['2'.repeat(64), '3'.repeat(64)]);
  });
});
