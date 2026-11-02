import { migrate, openDb, schema } from '@ogm/db';
import { describe, expect, it } from 'vitest';

import { ticketForScopeTarget } from '../../src/scope/resolve.js';

describe('ticketForScopeTarget', () => {
  it('returns the filed ticket for the matching scope target and null otherwise', () => {
    const { db, sqlite } = openDb(':memory:');
    migrate({ sqlite });
    const at = '2026-11-01T18:00:00.000Z';
    db.insert(schema.families)
      .values({
        id: 'f_87000000-0000-4000-8000-000000000001',
        name: 'F',
        ownerUserId: 'u_87000000-0000-4000-8000-000000000001',
        createdAt: at,
      })
      .run();
    db.insert(schema.games)
      .values({
        id: 'g_87000000-0000-4000-8000-000000000001',
        familyId: 'f_87000000-0000-4000-8000-000000000001',
        ownerId: 'u_87000000-0000-4000-8000-000000000001',
        title: 'Game',
        visibility: 'private',
        repoVisibility: 'private',
        createdAt: at,
      })
      .run();
    db.insert(schema.jobs)
      .values({
        id: 'j_87000000-0000-4000-8000-000000000001',
        gameId: 'g_87000000-0000-4000-8000-000000000001',
        branchId: 'main',
        familyId: 'f_87000000-0000-4000-8000-000000000001',
        creatorId: 'u_87000000-0000-4000-8000-000000000001',
        kind: 'scope',
        complexity: 1,
        state: 'filed',
        start: 'now',
        slot: 'edit',
        plan: '{}',
        reservation: '{}',
        hardCapMicroUsd: 1,
        createdAt: at,
        updatedAt: at,
      })
      .run();
    db.insert(schema.scopeSessions)
      .values({
        id: 's_87000000-0000-4000-8000-000000000001',
        gameId: 'g_87000000-0000-4000-8000-000000000001',
        creatorId: 'u_87000000-0000-4000-8000-000000000001',
        jobId: 'j_87000000-0000-4000-8000-000000000001',
        ticket: '142',
        status: 'open',
        choices: JSON.stringify({
          genre: 'platformer',
          vibe: 'cozy',
          family: 'chunky-low-poly',
          world: 'island',
          players: 'single',
          pov: 'isometric',
        }),
        createdAt: at,
        updatedAt: at,
      })
      .run();

    expect(
      ticketForScopeTarget(db, {
        kind: 'scope',
        game_id: 'g_87000000-0000-4000-8000-000000000001',
        creator_id: 'u_87000000-0000-4000-8000-000000000001',
        session_id: 's_87000000-0000-4000-8000-000000000001',
      }),
    ).toBe('142');
    expect(
      ticketForScopeTarget(db, {
        kind: 'scope',
        game_id: 'g_87000000-0000-4000-8000-000000000001',
        creator_id: 'u_87000000-0000-4000-8000-000000000001',
        session_id: 's_87000000-0000-4000-8000-000000000099',
      }),
    ).toBeNull();
  });
});
