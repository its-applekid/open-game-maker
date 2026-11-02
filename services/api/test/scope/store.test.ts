import { readFileSync } from 'node:fs';

import type { AgreedScope } from '@ogm/contracts';
import { migrate, openDb, schema } from '@ogm/db';
import { describe, expect, it } from 'vitest';

import { scopeSessions } from '../../src/scope/store.js';

const at = '2026-11-01T18:00:00.000Z';
const ids = {
  family: 'f_87000000-0000-4000-8000-000000000001',
  creator: 'u_87000000-0000-4000-8000-000000000001',
  game: 'g_87000000-0000-4000-8000-000000000001',
  job: 'j_87000000-0000-4000-8000-000000000001',
  session: 's_88000000-0000-4000-8000-000000000001',
};
const agreed = JSON.parse(
  readFileSync(new URL('../../../../packages/contracts/fixtures/scope/agreed.json', import.meta.url), 'utf8'),
) as AgreedScope;

function setup() {
  const { sqlite, db } = openDb(':memory:');
  migrate({ sqlite });
  db.insert(schema.families).values({ id: ids.family, name: 'Family', ownerUserId: ids.creator, createdAt: at }).run();
  db.insert(schema.games)
    .values({
      id: ids.game,
      familyId: ids.family,
      ownerId: ids.creator,
      title: 'Game',
      visibility: 'private',
      repoVisibility: 'private',
      createdAt: at,
    })
    .run();
  db.insert(schema.jobs)
    .values({
      id: ids.job,
      gameId: ids.game,
      branchId: 'main',
      familyId: ids.family,
      creatorId: ids.creator,
      kind: 'scope',
      complexity: 1,
      state: 'running',
      start: 'now',
      slot: 'edit',
      plan: JSON.stringify({
        title: 'Scope game',
        summary: 'scope',
        scope: { included: [], excluded: [] },
        tickets: [{ key: 'scope', skills: ['gm-scope-options'], dependsOn: [], acceptanceCriteria: ['agree'] }],
      }),
      reservation: JSON.stringify({ amountMicroUsd: 1, sizeClass: 'small', confidence: 'low' }),
      hardCapMicroUsd: 1,
      createdAt: at,
      updatedAt: at,
    })
    .run();
  const session = scopeSessions.create(db, {
    id: ids.session,
    gameId: ids.game,
    creatorId: ids.creator,
    jobId: ids.job,
    choices: {
      genre: 'platformer',
      vibe: 'cozy',
      family: 'chunky-low-poly',
      world: 'island',
      players: 'single',
      pov: 'isometric',
    },
    at,
  });
  return { sqlite, db, session };
}

describe('scope session store revisions', () => {
  it('retains accepted agreements and keeps the latest revision on the session', () => {
    const { db, session } = setup();
    expect(session).toMatchObject({ status: 'open', revision: 0 });

    expect(scopeSessions.agree(db, ids.session, agreed, 'hash-1', at)).toBe(true);
    expect(scopeSessions.beginRevision(db, ids.session, 1, at)).toMatchObject({
      status: 'revising',
      revision: 1,
      scope: agreed,
    });
    expect(scopeSessions.beginRevision(db, ids.session, 1, at)).toMatchObject({ status: 'revising', revision: 1 });

    const revised = { ...agreed, revision: 2, title: 'Smaller Fox Workshop' };
    expect(scopeSessions.agree(db, ids.session, revised, 'hash-2', at)).toBe(true);
    expect(scopeSessions.revisions(db, ids.session)).toMatchObject([
      { revision: 1, scope: agreed, hash: 'hash-1' },
      { revision: 2, scope: revised, hash: 'hash-2' },
    ]);
    expect(scopeSessions.get(db, ids.session)).toMatchObject({ status: 'agreed', revision: 2, scope: revised });
  });

  it('refuses a stale revision start and a skipped agreement', () => {
    const { db } = setup();
    expect(scopeSessions.agree(db, ids.session, agreed, 'hash-1', at)).toBe(true);
    expect(scopeSessions.beginRevision(db, ids.session, 2, at)).toBeNull();
    expect(scopeSessions.agree(db, ids.session, { ...agreed, revision: 3 }, 'hash-3', at)).toBe(false);
    expect(scopeSessions.revisions(db, ids.session)).toHaveLength(1);
  });
});
