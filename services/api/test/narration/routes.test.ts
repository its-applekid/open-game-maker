import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { schema } from '@ogm/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { asUser, installUsers, INTERNAL_TOKEN, makeApp, makeDeps, type TestUser } from '../helpers.js';

const familyId = 'f_narration';
const gameId = 'g_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e01';
const now = '2026-11-01T00:00:00.000Z';
const owner: TestUser = {
  kind: 'user',
  userId: 'u_narration_owner',
  displayName: 'Owner',
  email: 'owner@example.test',
  familyId,
  platformRole: 'none',
  capability: 'creator',
};
const player: TestUser = {
  kind: 'user',
  userId: 'u_narration_player',
  displayName: 'Player',
  email: 'player@example.test',
  familyId,
  platformRole: 'none',
  capability: 'player',
};
const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function silentWav(): Buffer {
  const rate = 24_000;
  const audio = Buffer.alloc(rate * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + audio.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(audio.length, 40);
  return Buffer.concat([header, audio]);
}

describe('narration routes', () => {
  it('allows the creator and builder service, rejects other actors, and limits batches', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ogm-narration-route-'));
    roots.push(root);
    const wavPath = join(root, 'render.wav');
    let renders = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/healthz')) return Response.json({ ok: true, provider: 'fake' });
        if (url.endsWith('/internal/narration') && init?.method === 'POST') {
          renders += 1;
          await writeFile(wavPath, silentWav());
          return Response.json({
            wav_path: wavPath,
            format: 'pcm_24000',
            alignment: [{ text: 'Hello.', start_ms: 0, end_ms: 1_000 }],
          });
        }
        return new Response(null, { status: 404 });
      }),
    );

    const deps = makeDeps();
    deps.config.voiceHostInternalUrl = 'http://127.0.0.1:40401';
    deps.config.voiceInternalSecret = 'voice-internal-test-secret';
    installUsers(deps, [owner, player]);
    deps.db
      .insert(schema.families)
      .values({ id: familyId, name: 'Family', ownerUserId: owner.userId, createdAt: now })
      .run();
    deps.db
      .insert(schema.familyMembers)
      .values([
        { familyId, userId: owner.userId, role: 'owner', capability: 'creator', joinedAt: now },
        { familyId, userId: player.userId, role: 'member', capability: 'player', joinedAt: now },
      ])
      .run();
    deps.db
      .insert(schema.games)
      .values({
        id: gameId,
        familyId,
        ownerId: owner.userId,
        title: 'Narrated Game',
        visibility: 'private',
        repoVisibility: 'private',
        createdAt: now,
      })
      .run();
    const { app } = await makeApp(deps);
    const request = { lines: [{ id: 'intro', text: 'Hello.' }] };

    const created = await app.request(`/api/v1/games/${gameId}/narration/render`, {
      method: 'POST',
      headers: { ...asUser(owner.userId), 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject([{ id: 'intro', cached: false }]);

    const builder = await app.request(`/api/v1/games/${gameId}/narration/render`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${INTERNAL_TOKEN}`,
        'x-ogm-service': 'builder',
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    expect(builder.status).toBe(200);
    expect(await builder.json()).toMatchObject([{ id: 'intro', cached: true }]);
    expect(renders).toBe(1);

    const deniedPlayer = await app.request(`/api/v1/games/${gameId}/narration/render`, {
      method: 'POST',
      headers: { ...asUser(player.userId), 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(deniedPlayer.status).toBe(403);

    const deniedService = await app.request(`/api/v1/games/${gameId}/narration/render`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${INTERNAL_TOKEN}`,
        'x-ogm-service': 'rooms',
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    expect(deniedService.status).toBe(403);

    const tooMany = await app.request(`/api/v1/games/${gameId}/narration/render`, {
      method: 'POST',
      headers: { ...asUser(owner.userId), 'content-type': 'application/json' },
      body: JSON.stringify({ lines: Array.from({ length: 26 }, (_, index) => ({ id: String(index), text: 'Hi' })) }),
    });
    expect(tooMany.status).toBe(400);
  });
});
