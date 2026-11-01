import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { schema } from '@ogm/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { loadApiEnv } from '../../src/app/env.js';
import {
  buildBriefing,
  pushBriefing,
  registerVoiceTarget,
  startBriefingPush,
  type VoiceTarget,
} from '../../src/voice/briefing-push.js';
import { ids, NOW, worked } from '../budget/fixture.js';

const SECRET = 'voice-internal-secret-for-tests';
const defaults = { dailyAllowanceMicroUsd: 5_000_000, resetZone: 'America/Los_Angeles' };
const scope: VoiceTarget = { kind: 'scope', game_id: ids.game, session_id: 's_1', creator_id: ids.creator };
const build: VoiceTarget = {
  kind: 'build',
  game_id: ids.game,
  job_id: ids.running,
  ticket: '7',
  creator_id: ids.creator,
};

type Received = { auth: string | undefined; body: Record<string, unknown> };
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function fakeHost(delayMs = 0, status = 204) {
  const received: Received[] = [];
  const server: Server = createServer((req: IncomingMessage, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
    req.on('end', () => {
      if (req.url === '/internal/briefing' && req.method === 'POST') {
        received.push({ auth: req.headers.authorization, body: JSON.parse(raw) as Record<string, unknown> });
      }
      setTimeout(() => res.writeHead(status).end(), delayMs);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => {
    server.closeAllConnections();
    server.close();
  });
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, received };
}

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('buildBriefing', () => {
  it('puts the worked budget in the friendly unit, without dollars', async () => {
    const deps = worked();
    const briefing = await buildBriefing({ db: deps.db, defaults, now: () => NOW }, scope);
    const text = briefing.extra[0].text;
    expect(briefing.target_key).toBe('scope:s_1');
    expect(briefing.extra[0].title).toBe('Budget');
    expect(text).toBe(
      '20 energy left today (40%); resets 00:00; 2 free edit slots; 0 queued. ' +
        'Typical sizes in energy: small ≈ 5–15, medium ≈ 15–40, large ≈ 40–90, huge ≈ 90–200.',
    );
    expect(briefing.sections.map((section) => section.id)).toEqual(['budget', 'progress']);
    expect(briefing.sections[0].text).toContain('queue for the reset');
    expect(JSON.stringify(briefing)).not.toMatch(/\$|usd|dollar/i);
  });

  it('reports a build waiting on an admin with its stage words', async () => {
    const deps = worked();
    deps.db.update(schema.jobs).set({ state: 'paused_budget' }).where(eq(schema.jobs.id, ids.running)).run();
    const paused = await buildBriefing({ db: deps.db, defaults, now: () => NOW }, build);
    expect(paused).toMatchObject({
      target_key: 'build:' + ids.running,
      waiting_on: 'an admin',
      summary: 'Goblin camp',
    });
    expect(paused.current_task).toBe('paused_budget');

    deps.db
      .insert(schema.jobProjections)
      .values({
        jobId: ids.running,
        daemonSlug: 'd',
        ticket: '7',
        stage: 'building',
        stageText: 'Building',
        updatedAt: NOW.toISOString(),
      })
      .run();
    const staged = await buildBriefing({ db: deps.db, defaults, now: () => NOW }, build);
    expect(staged.current_task).toBe('Building');
    expect(staged.sections[1]).toEqual({ id: 'progress', text: 'Building' });
  });

  it('describes a scope session before the new game exists', async () => {
    const deps = worked();
    deps.db.delete(schema.games).where(eq(schema.games.id, ids.game)).run();

    const briefing = await buildBriefing({ db: deps.db, defaults, now: () => NOW }, scope);

    expect(briefing.summary).toBe('a new game');
    expect(briefing.extra[0].text).toContain('energy left today');
  });

  it('includes open checkpoint questions in the order they were opened', async () => {
    const deps = worked();
    deps.db
      .insert(schema.checkpoints)
      .values([
        {
          decisionId: 'd_second',
          jobId: ids.running,
          daemonSlug: 'daemon',
          version: 1,
          question: 'Which color should the camp use?',
          options: '[]',
          status: 'open',
          openedAt: '2026-10-31T19:02:00.000Z',
        },
        {
          decisionId: 'd_answered',
          jobId: ids.running,
          daemonSlug: 'daemon',
          version: 1,
          question: 'Should the gate open inward?',
          options: '[]',
          status: 'answered',
          openedAt: '2026-10-31T19:00:00.000Z',
          answeredAt: '2026-10-31T19:01:00.000Z',
        },
        {
          decisionId: 'd_first',
          jobId: ids.running,
          daemonSlug: 'daemon',
          version: 1,
          question: 'How many goblins should appear?',
          options: '[]',
          status: 'open',
          openedAt: '2026-10-31T19:01:00.000Z',
        },
      ])
      .run();

    const briefing = await buildBriefing({ db: deps.db, defaults, now: () => NOW }, build);

    expect(briefing.questions).toEqual(['How many goblins should appear?', 'Which color should the camp use?']);
  });
});

describe('pushBriefing', () => {
  it('posts the T06 briefing with the bearer', async () => {
    const deps = worked();
    const host = await fakeHost();
    // A cold first connection can outlast 300 ms; this case checks the shape, not the deadline.
    await pushBriefing(
      { db: deps.db, defaults, url: host.url, secret: SECRET, log: deps.log, timeoutMs: 5_000 },
      scope,
    );
    expect(host.received).toHaveLength(1);
    expect(host.received[0].auth).toBe(`Bearer ${SECRET}`);
    expect(Object.keys(host.received[0].body).sort()).toEqual(
      [
        'current_task',
        'extra',
        'next_steps',
        'observed_at',
        'questions',
        'sections',
        'summary',
        'target_key',
        'waiting_on',
      ].sort(),
    );
  });

  it('gives up at 300 ms without throwing and logs once a minute per target', async () => {
    const deps = worked();
    const host = await fakeHost(1_000);
    const pushDeps = { db: deps.db, defaults, url: host.url, secret: SECRET, log: deps.log };
    const slow: VoiceTarget = { ...scope, session_id: 's_slow' };
    const started = Date.now();
    await expect(pushBriefing(pushDeps, slow)).resolves.toBeUndefined();
    expect(Date.now() - started).toBeLessThan(900);
    await pushBriefing(pushDeps, slow);
    expect(deps.lines.filter((line) => line.event === 'briefing-push-failed')).toHaveLength(1);
    cleanups.push(startBriefingPush({ ...pushDeps, events: deps.events })); // clears the failure log
  });

  it('logs a voice host that refuses the push', async () => {
    const deps = worked();
    const host = await fakeHost(0, 401);
    await pushBriefing(
      { db: deps.db, defaults, url: host.url, secret: SECRET, log: deps.log, timeoutMs: 5_000 },
      { ...scope, session_id: 's_401' },
    );
    expect(deps.lines).toContainEqual(
      expect.objectContaining({
        event: 'briefing-push-failed',
        target_key: 'scope:s_401',
        error: 'voice host answered 401',
      }),
    );
  });

  it('survives a voice host that is down', async () => {
    const deps = worked();
    await expect(
      pushBriefing(
        { db: deps.db, defaults, url: 'http://127.0.0.1:9', secret: SECRET, log: deps.log },
        { ...scope, session_id: 's_down' },
      ),
    ).resolves.toBeUndefined();
    expect(deps.lines).toContainEqual(
      expect.objectContaining({ event: 'briefing-push-failed', target_key: 'scope:s_down' }),
    );
  });
});

describe('subscriptions', () => {
  it('pushes once for a registered creator on budget.changed and never for others', async () => {
    const deps = worked();
    const host = await fakeHost();
    cleanups.push(
      startBriefingPush({
        db: deps.db,
        defaults,
        url: host.url,
        secret: SECRET,
        log: deps.log,
        events: deps.events,
        debounceMs: 20,
      }),
    );
    registerVoiceTarget(scope);
    await settle(150);
    expect(host.received).toHaveLength(1);

    deps.events.emit('budget.changed', { familyId: ids.family, userId: ids.creator });
    deps.events.emit('budget.changed', { familyId: ids.family, userId: ids.creator });
    deps.events.emit('budget.changed', { familyId: ids.family, userId: ids.other });
    await settle(150);
    expect(host.received).toHaveLength(2);

    deps.events.emit('job.changed', { jobId: ids.running, gameId: ids.game, familyId: ids.family, state: 'running' });
    await settle(150);
    expect(host.received).toHaveLength(3);
  });

  it('stops pushing after the target expires', async () => {
    const deps = worked();
    const host = await fakeHost();
    cleanups.push(
      startBriefingPush({
        db: deps.db,
        defaults,
        url: host.url,
        secret: SECRET,
        log: deps.log,
        events: deps.events,
        debounceMs: 20,
      }),
    );
    registerVoiceTarget(scope, 0);
    deps.events.emit('budget.changed', { familyId: ids.family, userId: ids.creator });
    await settle(150);
    expect(host.received).toHaveLength(1); // the registration push only
  });
});

describe('voice host env', () => {
  const baseEnv = {
    OGM_API_PORT: '4000',
    OGM_DATA_DIR: '/tmp/ogm-test',
    OGM_INTERNAL_TOKEN: 'internal-token-for-tests-0123456789',
    OGM_JOB_TOKEN_SECRET: 'job-token-secret-for-tests-0123456789',
    OGM_BLOB_ROOT: '/tmp/ogm-blobs-test',
    OGM_BLOB_SIGNING_KEY: 'blob-signing-key-for-tests-with-32-bytes',
    OGM_PUBLIC_ORIGIN: 'https://api.example.test',
    OGM_APP_ORIGIN: 'https://app.example.test',
    OGM_ROOMS_INTERNAL_URL: 'http://127.0.0.1:4302',
    OGM_ROOMS_INTERNAL_SECRET: 'rooms-internal-secret-for-tests',
    OGM_WS_TOKEN_SECRET: 'room-grant-secret-for-tests-with-32-bytes',
    OGM_COMMIT_INTERNAL_URL: 'http://127.0.0.1:4301',
    OGM_COMMIT_SERVICE_TOKEN: 'commit-service-token-for-tests',
    OGM_VAPID_SUBJECT: 'operator@example.test',
  };

  it('sends the secret only to a loopback voice host', () => {
    expect(
      loadApiEnv({
        ...baseEnv,
        OGM_VOICE_HOST_INTERNAL_URL: 'http://127.0.0.1:4700',
        OGM_VOICE_INTERNAL_SECRET: SECRET,
      }),
    ).toMatchObject({ OGM_VOICE_HOST_INTERNAL_URL: 'http://127.0.0.1:4700' });
    expect(() =>
      loadApiEnv({
        ...baseEnv,
        OGM_VOICE_HOST_INTERNAL_URL: 'http://10.0.0.5:4000',
        OGM_VOICE_INTERNAL_SECRET: SECRET,
      }),
    ).toThrow(/OGM_VOICE_HOST_INTERNAL_URL/);
    expect(() => loadApiEnv({ ...baseEnv, OGM_VOICE_HOST_INTERNAL_URL: 'http://127.0.0.1:4700' })).toThrow(
      /OGM_VOICE_INTERNAL_SECRET/,
    );
    expect(loadApiEnv(baseEnv).OGM_VOICE_HOST_INTERNAL_URL).toBeUndefined();
  });
});
