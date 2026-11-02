import { schema } from '@ogm/db';
import { describe, expect, it } from 'vitest';

import { activeJobs, activeJobsForRepo, byTicket } from '../src/jobs/repo.js';
import { makeDeps } from './helpers.js';

function setup() {
  const deps = makeDeps();
  deps.db
    .insert(schema.families)
    .values({ id: 'f_1', name: 'Family', ownerUserId: 'u_1', createdAt: '2026-11-01T00:00:00.000Z' })
    .run();
  deps.db
    .insert(schema.games)
    .values({
      id: 'g_1',
      familyId: 'f_1',
      ownerId: 'u_1',
      title: 'Game',
      visibility: 'private',
      githubOwner: 'Owner',
      githubRepo: 'Game',
      repoVisibility: 'private',
      createdAt: '2026-11-01T00:00:00.000Z',
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
      maxConcurrentAgents: 1,
      createdAt: '2026-11-01T00:00:00.000Z',
    })
    .run();
  return deps;
}

function insertJob(
  deps: ReturnType<typeof makeDeps>,
  id: string,
  issueNumber: number,
  state: 'queued' | 'admitted' | 'running' | 'done',
) {
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
      aiurRepo: state === 'admitted' ? null : 'owner/game',
      aiurIssueNumber: state === 'admitted' ? null : issueNumber,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
      terminalAt: state === 'done' ? '2026-11-01T01:00:00.000Z' : null,
    })
    .run();
}

describe('job projection directory', () => {
  it('resolves daemon tickets and lists only non-terminal jobs', () => {
    const deps = setup();
    insertJob(deps, 'j_queued', 141, 'queued');
    insertJob(deps, 'j_admitted', 0, 'admitted');
    insertJob(deps, 'j_running', 142, 'running');
    insertJob(deps, 'j_done', 143, 'done');

    expect(byTicket(deps.db, 'owner-game', '142')).toEqual({ id: 'j_running', state: 'running' });
    expect(byTicket(deps.db, 'other-game', '142')).toBeNull();
    expect(byTicket(deps.db, 'owner-game', 'not-a-ticket')).toBeNull();
    expect(activeJobs(deps.db, 'owner-game')).toEqual([
      { jobId: 'j_queued', ticket: '141' },
      { jobId: 'j_running', ticket: '142' },
    ]);
    expect(activeJobsForRepo(deps.db, 'OWNER/GAME')).toEqual([{ kind: 'feature' }, { kind: 'feature' }]);
  });
});
