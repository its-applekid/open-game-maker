import { schema } from '@ogm/db';
import { describe, expect, it } from 'vitest';

import { createChatJobDirectory } from '../../src/build-chat/job-directory.js';
import { makeDeps } from '../helpers.js';

const NOW = '2026-11-01T00:00:00.000Z';

function insertJob(deps: ReturnType<typeof makeDeps>, id: string, state: 'queued' | 'running', ticket?: number): void {
  deps.db
    .insert(schema.jobs)
    .values({
      id,
      gameId: 'g_1',
      branchId: 'main',
      familyId: 'f_1',
      creatorId: 'u_1',
      kind: 'feature',
      complexity: 1,
      state,
      start: 'now',
      slot: 'edit',
      plan: JSON.stringify({
        title: 'Feature',
        summary: 'Build it',
        scope: { included: ['feature'], excluded: [] },
        tickets: [{ key: 'T1', skills: [], dependsOn: [], acceptanceCriteria: ['works'] }],
      }),
      reservation: '{"amountMicroUsd":500000,"sizeClass":"small","confidence":"low"}',
      hardCapMicroUsd: 500_000,
      aiurRepo: ticket === undefined ? null : 'owner/game',
      aiurIssueNumber: ticket ?? null,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .run();
}

describe('build chat job directory', () => {
  it('maps job ownership and lists only active jobs with daemon tickets', async () => {
    const deps = makeDeps();
    deps.db.insert(schema.families).values({ id: 'f_1', name: 'Family', ownerUserId: 'u_1', createdAt: NOW }).run();
    deps.db
      .insert(schema.games)
      .values({
        id: 'g_1',
        familyId: 'f_1',
        ownerId: 'u_1',
        title: 'Game',
        // The game's slug keys its daemon.
        slug: 'owner-game',
        visibility: 'private',
        repoVisibility: 'private',
        createdAt: NOW,
      })
      .run();
    deps.db
      .insert(schema.gameDaemons)
      .values({
        slug: 'owner-game',
        repo: 'owner/game',
        checkoutPath: '/games/owner-game',
        unit: 'ogm-aiur@owner-game.service',
        envFile: '/config/owner-game.env',
        port: 4101,
        status: 'running',
        createdAt: NOW,
      })
      .run();
    insertJob(deps, 'j_queued', 'queued');
    insertJob(deps, 'j_running', 'running', 142);

    const directory = createChatJobDirectory(deps.db);
    expect(await directory.get('j_running')).toEqual({
      jobId: 'j_running',
      gameId: 'g_1',
      familyId: 'f_1',
      ownerId: 'u_1',
      kind: 'feature',
      state: 'running',
      aiur: { daemonSlug: 'owner-game', ticket: '142' },
    });
    expect(await directory.get('j_queued')).toMatchObject({ aiur: null, ownerId: 'u_1' });
    expect(await directory.get('missing')).toBeNull();
    expect(await directory.active()).toEqual([await directory.get('j_running')]);
  });
});
