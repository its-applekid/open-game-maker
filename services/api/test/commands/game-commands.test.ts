import type { AiurClient } from '@ogm/aiur-client';
import { schema } from '@ogm/db';
import { describe, expect, it } from 'vitest';

import { insertChatRow } from '../../src/build-chat/store.js';
import { asUser, installUsers, makeApp, makeDeps } from '../helpers.js';

const ids = {
  family: 'f_60000000-0000-4000-8000-000000000001',
  user: 'u_60000000-0000-4000-8000-000000000001',
  outsider: 'u_60000000-0000-4000-8000-000000000002',
  otherFamily: 'f_60000000-0000-4000-8000-000000000003',
  game: 'g_60000000-0000-4000-8000-000000000001',
  otherGame: 'g_60000000-0000-4000-8000-000000000002',
  job: 'j_60000000-0000-4000-8000-000000000001',
  otherJob: 'j_60000000-0000-4000-8000-000000000002',
  linkedJob: 'j_60000000-0000-4000-8000-000000000003',
};

const AT = '2026-11-04T10:00:00.000Z';
const ULID = '01JBX2Q7M3K8V5N4R6T9W0YZAB';
const MEDIA_ID = '01JBX2Q7M3K8V5N4R6T9W0YZAC';

function seed() {
  const deps = makeDeps();
  deps.db
    .insert(schema.families)
    .values({ id: ids.family, name: 'Family', ownerUserId: ids.user, createdAt: AT })
    .run();
  deps.db
    .insert(schema.familyMembers)
    .values({ familyId: ids.family, userId: ids.user, role: 'owner', capability: 'creator', joinedAt: AT })
    .run();
  for (const id of [ids.game, ids.otherGame]) {
    deps.db
      .insert(schema.games)
      .values({
        id,
        familyId: ids.family,
        ownerId: ids.user,
        title: `Game ${id.slice(-1)}`,
        visibility: 'private',
        repoVisibility: 'private',
        createdAt: AT,
      })
      .run();
  }
  installUsers(deps, [
    {
      kind: 'user',
      userId: ids.user,
      familyId: ids.family,
      platformRole: 'none',
      capability: 'creator',
      email: 'creator@example.test',
    },
    {
      kind: 'user',
      userId: ids.outsider,
      familyId: ids.otherFamily,
      platformRole: 'none',
      capability: 'creator',
      email: 'outsider@example.test',
    },
  ]);
  return deps;
}

function job(deps: ReturnType<typeof makeDeps>, id: string, gameId: string, createdAt: string) {
  deps.db
    .insert(schema.jobs)
    .values({
      id,
      gameId,
      branchId: 'main',
      familyId: ids.family,
      creatorId: ids.user,
      kind: 'feature',
      complexity: 2,
      state: 'running',
      start: 'now',
      slot: 'edit',
      plan: JSON.stringify({
        title: `Job ${id.slice(-1)}`,
        summary: 'Add the moon gate',
        scope: { included: ['moon gate'], excluded: [] },
        targetControls: [],
        tickets: [{ key: 'T1', skills: [], dependsOn: [], acceptanceCriteria: ['loads'] }],
      }),
      reservation: JSON.stringify({ amountMicroUsd: 500_000, sizeClass: 'small', confidence: 'high' }),
      hardCapMicroUsd: 500_000,
      usageMicroUsd: 0,
      idempotencyKey: `key-${id}`,
      createdAt,
      updatedAt: createdAt,
    })
    .run();
}

function checkpoint(
  deps: ReturnType<typeof makeDeps>,
  jobId: string,
  id: string,
  overrides: {
    decision_id?: string;
    status?: 'open' | 'answered' | 'moot';
    version?: number | undefined;
    at?: string;
    options?: Array<{ id: string; label: string; media_id?: string }>;
  } = {},
) {
  insertChatRow(deps.sqlite, {
    id,
    jobId,
    at: overrides.at ?? AT,
    actor: 'agent',
    kind: 'checkpoint',
    checkpoint: {
      decision_id: overrides.decision_id ?? `d_${id.slice(-6)}`,
      question: 'Which door?',
      options: overrides.options ?? [
        { id: 'wood', label: 'Wooden door' },
        { id: 'iron', label: 'Iron door' },
      ],
      recommend: 'wood',
      blocking: true,
      status: overrides.status ?? 'open',
      ...(overrides.version === undefined ? { version: 3 } : { version: overrides.version }),
    },
  });
}

async function appWithJobs() {
  const deps = seed();
  job(deps, ids.job, ids.game, '2026-11-04T09:00:00.000Z');
  job(deps, ids.linkedJob, ids.game, '2026-11-04T11:00:00.000Z');
  job(deps, ids.otherJob, ids.otherGame, '2026-11-04T09:30:00.000Z');
  const { app } = await makeApp(deps);
  return { app, deps };
}

const get = async (app: Awaited<ReturnType<typeof makeApp>>['app'], gameId: string, userId = ids.user) => {
  const response = await app.request(`/api/v1/games/${gameId}/commands`, { headers: asUser(userId) });
  if (!response.ok) console.error('FAILBODY', response.status, await response.clone().text());
  return response;
};

describe('game commands inbox', () => {
  it('lists the open Commands of every job in the game, newest first', async () => {
    const { app, deps } = await appWithJobs();
    checkpoint(deps, ids.job, ULID);
    checkpoint(deps, ids.linkedJob, MEDIA_ID, { at: '2026-11-04T12:00:00.000Z' });
    checkpoint(deps, ids.otherJob, '01JBX2Q7M3K8V5N4R6T9W0YZAD');

    const body = (await (await get(app, ids.game)).json()) as {
      commands: Array<{
        job_id: string;
        title: string;
        checkpoint_id: string;
        question: string;
        version: number;
        options: unknown;
      }>;
    };

    expect(body.commands.map(({ job_id }) => job_id)).toEqual([ids.linkedJob, ids.job]);
    expect(body.commands[0]).toMatchObject({
      title: 'Job 3',
      checkpoint_id: MEDIA_ID,
      question: 'Which door?',
      version: 3,
    });
    expect(body.commands[0]!.options).toEqual([
      { id: 'wood', label: 'Wooden door' },
      { id: 'iron', label: 'Iron door' },
    ]);
  });

  it('leaves out answered, moot, and uncorrelated Commands', async () => {
    const { app, deps } = await appWithJobs();
    checkpoint(deps, ids.job, ULID, { status: 'answered' });
    checkpoint(deps, ids.linkedJob, MEDIA_ID, { decision_id: '' });

    const body = (await (await get(app, ids.game)).json()) as { commands: unknown[] };

    expect(body.commands).toEqual([]);
  });

  it('names the ticket and signs the media an option references', async () => {
    const { app, deps } = await appWithJobs();
    deps.db.update(schema.jobs).set({ aiurIssueNumber: 478 }).run();
    insertChatRow(deps.sqlite, {
      id: '01JBX2Q7M3K8V5N4R6T9W0YZAE',
      jobId: ids.job,
      actor: 'agent',
      kind: 'image',
      media: { hash: `sha256:${'a'.repeat(64)}`, width: 320, height: 200 },
    });
    checkpoint(deps, ids.job, ULID, {
      options: [
        { id: 'wood', label: 'Wooden door', media_id: '01JBX2Q7M3K8V5N4R6T9W0YZAE' },
        { id: 'iron', label: 'Iron door', media_id: '01JBX2Q7M3K8V5N4R6T9W0YZAF' },
      ],
    });

    const body = (await (await get(app, ids.game)).json()) as {
      commands: Array<{
        ticket: string | null;
        options: Array<{ id: string; media?: { url: string; width: number } }>;
      }>;
    };

    expect(body.commands[0]!.ticket).toBe('478');
    expect(body.commands[0]!.options[0]!.media).toMatchObject({ width: 320 });
    expect(body.commands[0]!.options[0]!.media?.url).toContain('/blobs/');
    // A media id that names no row in this job leaves the option without media.
    expect(body.commands[0]!.options[1]).toEqual({ id: 'iron', label: 'Iron door' });
  });

  it('leaves out a malformed Command instead of failing the whole inbox', async () => {
    const { app, deps } = await appWithJobs();
    checkpoint(deps, ids.job, ULID, { options: [{ id: 'wood', label: 'Wooden door' }] });
    checkpoint(deps, ids.linkedJob, MEDIA_ID, { at: '2026-11-04T12:00:00.000Z' });

    const body = (await (await get(app, ids.game)).json()) as { commands: Array<{ job_id: string }> };

    expect(body.commands.map(({ job_id }) => job_id)).toEqual([ids.linkedJob]);
  });

  it('refuses a game outside the caller’s family', async () => {
    const { app } = await appWithJobs();

    expect((await get(app, ids.game, ids.outsider)).status).toBe(404);
  });

  it('refuses an anonymous caller', async () => {
    const { app } = await appWithJobs();

    expect((await app.request(`/api/v1/games/${ids.game}/commands`)).status).toBe(401);
  });
});

// The answer path the inbox uses is the job's checkpoint route; it must reach aiur's Decision API unchanged.
describe('answering from the inbox', () => {
  it('posts the option through the job checkpoint route', async () => {
    const { app, deps } = await appWithJobs();
    const chatJob = {
      jobId: ids.job,
      gameId: ids.game,
      familyId: ids.family,
      ownerId: ids.user,
      kind: 'feature' as const,
      state: 'running',
      aiur: { daemonSlug: 'game-1', ticket: '478' },
    };
    deps.registry.chatJobs = {
      get: async (jobId) => (jobId === ids.job ? chatJob : null),
      active: async () => [chatJob],
    };
    deps.registry.aiurClientFor = async () =>
      ({ decide: async () => ({ version: 4, status: 'answered' }) }) as unknown as AiurClient;
    checkpoint(deps, ids.job, ULID);
    const inbox = (await (await get(app, ids.game)).json()) as { commands: Array<{ checkpoint_id: string }> };

    const response = await app.request(
      `/api/v1/jobs/${ids.job}/checkpoints/${inbox.commands[0]!.checkpoint_id}/answer`,
      {
        method: 'POST',
        headers: { ...asUser(ids.user), 'content-type': 'application/json' },
        body: JSON.stringify({ option_id: 'wood' }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'answered', option_id: 'wood' });
  });
});
