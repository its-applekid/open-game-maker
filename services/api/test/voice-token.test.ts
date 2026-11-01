import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { schema } from '@ogm/db';
import { describe, expect, it } from 'vitest';

import { loadApiEnv } from '../src/app/env.js';
import { createGameRow } from '../src/games/games.js';
import { mintVoiceToken, VOICE_TOKEN_TTL_SEC } from '../src/voice/token.js';
import { asUser, installUsers, makeApp, makeDeps, type TestUser } from './helpers.js';

const now = '2026-11-01T00:00:00.000Z';
const familyId = 'f-family';
const secret = 'ogm-test-secret-0123456789abcdef0123';
const wsUrl = 'wss://voice.example.test/ws/voice';
const member = (userId: string, capability: 'creator' | 'player' = 'creator'): TestUser => ({
  kind: 'user',
  userId,
  email: `${userId}@example.com`,
  familyId,
  platformRole: 'none',
  capability,
});
const creator = member('u-creator');
const sibling = member('u-sibling');

function decode(token: string) {
  const [prefix, payload, mac] = token.split('.');
  return {
    prefix,
    mac,
    body: `${prefix}.${payload}`,
    claims: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>,
  };
}

async function setup(
  config: { voiceTokenSecret?: string; voiceWsUrl?: string } = { voiceTokenSecret: secret, voiceWsUrl: wsUrl },
) {
  const deps = makeDeps();
  Object.assign(deps.config, config);
  installUsers(deps, [creator, sibling]);
  deps.db
    .insert(schema.families)
    .values({ id: familyId, name: 'Household', ownerUserId: creator.userId, createdAt: now })
    .run();
  deps.db
    .insert(schema.familyMembers)
    .values(
      [creator, sibling].map(({ userId }) => ({
        familyId,
        userId,
        role: 'member',
        capability: 'creator',
        joinedAt: now,
      })),
    )
    .run();
  const game = createGameRow(deps.db, {
    familyId,
    ownerId: creator.userId,
    title: 'Castle',
    repoVisibility: 'private',
  });
  const { app } = await makeApp(deps);
  const request = (user: TestUser, target: Record<string, string>) =>
    app.request('/api/v1/voice/token', {
      method: 'POST',
      headers: { ...asUser(user.userId), 'content-type': 'application/json' },
      body: JSON.stringify({ target }),
    });
  return { request, gameId: game.id };
}

const buildTarget = (gameId: string, creatorId = creator.userId) => ({
  kind: 'build',
  game_id: gameId,
  job_id: 'j-1',
  ticket: '142',
  creator_id: creatorId,
});

describe('POST /api/v1/voice/token', () => {
  it('mints a vct1 token for the game owner, signed with the shared secret and valid for at most 300 s', async () => {
    const { request, gameId } = await setup();
    const before = Math.floor(Date.now() / 1000);
    const response = await request(creator, buildTarget(gameId));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string; expires_at: string; url: string };
    expect(body.url).toBe(wsUrl);
    const { prefix, body: signed, mac, claims } = decode(body.token);
    expect(prefix).toBe('vct1');
    expect(mac).toBe(createHmac('sha256', secret).update(signed).digest('base64url'));
    expect(claims).toMatchObject({ scope: 'converse', sub: creator.userId });
    expect(claims.exp as number).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + VOICE_TOKEN_TTL_SEC);
    expect(claims.exp as number).toBeGreaterThanOrEqual(before + VOICE_TOKEN_TTL_SEC);
    expect(Date.parse(body.expires_at)).toBe((claims.exp as number) * 1000);
  });

  it("refuses a family member who may not edit the game (403), so the voice host never sees another creator's target", async () => {
    const { request, gameId } = await setup();
    const response = await request(sibling, buildTarget(gameId, sibling.userId));
    expect(response.status).toBe(403);
  });

  it('refuses a target naming someone else as creator, since the host binds the session to the token subject', async () => {
    const { request, gameId } = await setup();
    const response = await request(creator, buildTarget(gameId, sibling.userId));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'not_target_creator' });
  });

  it('answers 503 until the voice secret and URL are configured', async () => {
    const { request, gameId } = await setup({});
    const response = await request(creator, buildTarget(gameId));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'voice_unavailable' });
  });

  it('rejects a malformed target', async () => {
    const { request, gameId } = await setup();
    const response = await request(creator, { kind: 'scope', game_id: gameId, creator_id: creator.userId });
    expect(response.status).toBe(400);
  });
});

describe('voice token configuration', () => {
  const baseEnv = {
    OGM_API_PORT: '4300',
    OGM_DATA_DIR: '/tmp/ogm',
    OGM_INTERNAL_TOKEN: 'internal-token-0123456789',
    OGM_JOB_TOKEN_SECRET: 'job-token-secret-0123456789',
    OGM_BLOB_ROOT: '/tmp/ogm/blobs',
    OGM_BLOB_SIGNING_KEY: 'blob-signing-key-0123456789',
    OGM_PUBLIC_ORIGIN: 'https://api.example.test',
    OGM_APP_ORIGIN: 'https://app.example.test',
    OGM_COMMIT_INTERNAL_URL: 'http://127.0.0.1:4301',
    OGM_COMMIT_SERVICE_TOKEN: 'commit-token-0123456789',
    OGM_VAPID_SUBJECT: 'operator@example.test',
  };

  it('refuses a token secret the voice host would reject (under 32 bytes), naming the variable', () => {
    expect(() => loadApiEnv({ ...baseEnv, OGM_VOICE_TOKEN_SECRET: 'x'.repeat(31) })).toThrow(/OGM_VOICE_TOKEN_SECRET/);
    expect(loadApiEnv({ ...baseEnv, OGM_VOICE_TOKEN_SECRET: secret }).OGM_VOICE_TOKEN_SECRET).toBe(secret);
    expect(loadApiEnv(baseEnv).OGM_VOICE_TOKEN_SECRET).toBeUndefined();
  });
});

// Cross-language vectors: the voice host's ExUnit `token_test` verifies each with the same secret
// and clock, so a format drift on either side fails there. Minting is deterministic (fixed clock
// and nonce), so rewriting the fixture on every run leaves it unchanged.
describe('voice token vectors', () => {
  it('writes the vectors the Elixir verifier checks', () => {
    const nowMs = Date.UTC(2026, 10, 1, 5, 25);
    const verifyAt = nowMs / 1000;
    const mint = (opts: { nowMs: number; scope?: string }) =>
      mintVoiceToken({ secret, sub: 'u-creator', nonce: 'AAAAAAAAAAAAAAAA', ...opts }).token;
    const valid = mint({ nowMs });
    const flipped = valid.at(-2) === 'A' ? 'B' : 'A';
    const vectors = {
      secret,
      verify_at: verifyAt,
      vectors: [
        { name: 'valid', token: valid, sub: 'u-creator', exp: verifyAt + VOICE_TOKEN_TTL_SEC, expect: 'ok' },
        { name: 'expired', token: mint({ nowMs: nowMs - 600_000 }), expect: 'expired' },
        { name: 'tampered', token: `${valid.slice(0, -2)}${flipped}${valid.at(-1)}`, expect: 'invalid' },
        { name: 'other scope', token: mint({ nowMs, scope: 'narrate' }), expect: 'wrong_scope' },
      ],
    };
    expect(decode(valid).claims).toEqual({
      scope: 'converse',
      sub: 'u-creator',
      exp: verifyAt + 300,
      nonce: 'AAAAAAAAAAAAAAAA',
    });
    writeFileSync(
      new URL('../../voice-host/test/fixtures/token_vectors.json', import.meta.url),
      `${JSON.stringify(vectors, null, 2)}\n`,
    );
  });
});
