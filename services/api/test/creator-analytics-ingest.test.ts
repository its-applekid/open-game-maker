import { schema } from '@ogm/db';
import { desc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { deleteUserEvents, ingestPlayEvents } from '../src/creator-analytics/ingest.js';
import { pseudonymForUser, rotateDueSalts } from '../src/creator-analytics/pseudonym.js';
import { makeDeps } from './helpers.js';

const now = '2026-11-01T12:00:00.000Z';
const rotationMs = 30 * 24 * 60 * 60 * 1_000;
const dayMs = 24 * 60 * 60 * 1_000;
const branchId = 'branch_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const releaseId = 'release_01ARZ3NDEKTSV4RRFFQ69G5FAV';

// One day past the 30-day rotation window, measured from the salt's stored creation
// time. ingestPlayEvents stamps the first salt with the wall clock, so a literal
// instant would stop being due as the real date advances; deriving from the stored
// time keeps the rotation date-independent.
function rotationDueFrom(deps: ReturnType<typeof makeDeps>, gameId: string): string {
  const salt = deps.db
    .select()
    .from(schema.analyticsSalts)
    .where(eq(schema.analyticsSalts.gameId, gameId))
    .orderBy(desc(schema.analyticsSalts.rotatedAt))
    .get();
  if (!salt) throw new Error(`expected a minted analytics salt for ${gameId}`);
  return new Date(Date.parse(salt.rotatedAt) + rotationMs + dayMs).toISOString();
}

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

    const later = rotationDueFrom(deps, 'g-one');
    expect(rotateDueSalts(deps.db, later)).toBe(1);
    const after = pseudonymForUser(deps.db, 'g-one', 'u-player', later);
    expect(after).not.toBe(before);
    ingestPlayEvents(deps.db, 'u-player', 'g-one', [event({ ts: later, sessionId: 'after' })]);
    ingestPlayEvents(deps.db, 'u-other', 'g-one', [event({ ts: later, sessionId: 'other' })]);

    expect(deleteUserEvents(deps.db, 'u-player')).toBe(2);
    expect(deps.db.select().from(schema.creatorAnalyticsEvents).all()).toEqual([
      expect.objectContaining({ sessionId: 'other' }),
    ]);
  });
});
