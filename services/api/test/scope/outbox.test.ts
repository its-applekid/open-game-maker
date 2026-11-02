import { readFileSync } from 'node:fs';

import { AgentOutboxLine } from '@ogm/contracts';
import { migrate, openDb, schema } from '@ogm/db';
import { describe, expect, it, vi } from 'vitest';

import { handle } from '../../src/scope/outbox.js';

const at = '2026-11-01T18:00:00.000Z';
const ids = {
  family: 'f_88000000-0000-4000-8000-000000000001',
  creator: 'u_88000000-0000-4000-8000-000000000001',
  game: 'g_88000000-0000-4000-8000-000000000001',
  job: 'j_88000000-0000-4000-8000-000000000001',
  session: 's_88000000-0000-4000-8000-000000000001',
};
const agreed = JSON.parse(
  readFileSync(new URL('../../../../packages/contracts/fixtures/scope/agreed.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

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
  db.insert(schema.scopeSessions)
    .values({
      id: ids.session,
      gameId: ids.game,
      creatorId: ids.creator,
      jobId: ids.job,
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
  const publish = vi.fn();
  const notify = vi.fn();
  const log = vi.fn();
  const context = {
    jobId: ids.job,
    workspaceRoot: '/workspace',
    db,
    sqlite,
    blobStore: {} as never,
    publish,
    notify,
    log,
  };
  return { sqlite, db, publish, notify, log, context };
}

function line(id = '01ARZ3NDEKTSV4RRFFQ69G5FAV', payload = agreed) {
  return AgentOutboxLine.parse({ v: 1, id, job_id: ids.job, at, type: 'scope.agreed', payload });
}

describe('scope.agreed outbox handler', () => {
  it('stores and publishes one matching scope idempotently', async () => {
    const input = setup();

    await handle(line(), input.context);
    await handle(line('01ARZ3NDEKTSV4RRFFQ69G5FAW'), input.context);

    expect(input.db.select().from(schema.scopeSessions).get()).toMatchObject({ status: 'agreed' });
    expect(input.sqlite.prepare('SELECT actor, text FROM build_chat_messages').all()).toEqual([
      { actor: 'system', text: 'Scope agreed' },
    ]);
    expect(input.publish).toHaveBeenCalledTimes(1);
    expect(input.notify).toHaveBeenCalledWith({
      kind: 'scope.agreed',
      userIds: [ids.creator],
      gameId: ids.game,
      jobId: ids.job,
      sessionId: ids.session,
    });
  });

  it('rejects and logs a scope for another session', async () => {
    const input = setup();
    const payload = { ...agreed, session_id: 's_88000000-0000-4000-8000-000000000099' };

    await expect(handle(line(undefined, payload), input.context)).rejects.toThrow('scope_session_mismatch');
    expect(input.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'scope-agreed-rejected', reason: 'session_mismatch' }),
    );
    expect(input.db.select().from(schema.scopeSessions).get()?.status).toBe('open');
  });
});
