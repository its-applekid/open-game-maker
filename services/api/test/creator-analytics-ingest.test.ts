import { schema } from '@ogm/db';
import { describe, expect, it } from 'vitest';

import { deleteUserEvents, ingestPlayEvents } from '../src/creator-analytics/ingest.js';
import { pseudonymForUser, rotateDueSalts } from '../src/creator-analytics/pseudonym.js';
import { makeDeps } from './helpers.js';

const now = '2026-11-01T12:00:00.000Z';
const branchId = 'branch_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const releaseId = 'release_01ARZ3NDEKTSV4RRFFQ69G5FAV';

function seedGames(deps: ReturnType<typeof makeDeps>) {
  deps.db
    .insert(schema.families)
    .values({ id: 'f-analytics', name: 'Family', ownerUserId: 'u-owner', createdAt: now })
    .run();
  deps.db
    .insert(schema.games)
    .values([
      {
        id: 'g-one',
        familyId: 'f-analytics',
        ownerId: 'u-owner',
        title: 'One',
        visibility: 'listed',
        repoVisibility: 'private',
        createdAt: now,
      },
      {
        id: 'g-two',
        familyId: 'f-analytics',
        ownerId: 'u-owner',
        title: 'Two',
        visibility: 'listed',
        repoVisibility: 'private',
        createdAt: now,
      },
    ])
    .run();
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    ts: now,
    branchId,
    releaseId,
    env: 'published',
    sessionId: 'session-one',
    name: 'session_start',
    props: { device: 'desktop', input: 'keyboard', tier: 'desktop', release: releaseId },
    ...overrides,
  };
}

describe('creator analytics ingestion', () => {
  it('stamps stable per-game pseudonyms and rejects unsafe props per event', () => {
    const deps = makeDeps();
    seedGames(deps);

    const result = ingestPlayEvents(deps.db, 'u-player', 'g-one', [
      event(),
      event({ sessionId: 'session-two', props: { note: 'free text' } }),
      event({ sessionId: 'session-three', props: { release: 'x'.repeat(1_100) } }),
      event({ sessionId: 'session-four', props: { device: 'Chrome on my work laptop' } }),
      event({ sessionId: 'session-five', props: { input: { kind: 'keyboard' } } }),
      event({ sessionId: 'session-six', props: { release: 'release-other' } }),
    ]);

    expect(result).toEqual({
      accepted: 1,
      rejected: 5,
      reasons: [
        { index: 1, reason: 'props_key' },
        { index: 2, reason: 'props_too_large' },
        { index: 3, reason: 'props_value' },
        { index: 4, reason: 'props_value' },
        { index: 5, reason: 'props_value' },
      ],
    });
    const stored = deps.db.select().from(schema.creatorAnalyticsEvents).all();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ gameId: 'g-one', pseudoUserId: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(stored[0]?.pseudoUserId).toBe(pseudonymForUser(deps.db, 'g-one', 'u-player', now));
    expect(pseudonymForUser(deps.db, 'g-two', 'u-player', now)).not.toBe(stored[0]?.pseudoUserId);
  });

  it('deletes one user across salt rotations without storing account ids in events', () => {
    const deps = makeDeps();
    seedGames(deps);
    // Mint the first salt at the fixed `now`: ingest stamps it with the wall clock, which would make the rotation below date-dependent.
    const before = pseudonymForUser(deps.db, 'g-one', 'u-player', now);
    ingestPlayEvents(deps.db, 'u-player', 'g-one', [event({ sessionId: 'before' })]);

    expect(rotateDueSalts(deps.db, '2026-12-02T12:00:00.000Z')).toBe(1);
    const after = pseudonymForUser(deps.db, 'g-one', 'u-player', '2026-12-02T12:00:00.000Z');
    expect(after).not.toBe(before);
    ingestPlayEvents(deps.db, 'u-player', 'g-one', [event({ ts: '2026-12-02T12:00:00.000Z', sessionId: 'after' })]);
    ingestPlayEvents(deps.db, 'u-other', 'g-one', [event({ ts: '2026-12-02T12:00:00.000Z', sessionId: 'other' })]);

    expect(deleteUserEvents(deps.db, 'u-player')).toBe(2);
    expect(deps.db.select().from(schema.creatorAnalyticsEvents).all()).toEqual([
      expect.objectContaining({ sessionId: 'other' }),
    ]);
  });
});
