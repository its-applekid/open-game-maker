import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { LIMITS, PROTOCOL_VERSION } from '@ogm/contracts';

import {
  OTHER_GRANT_SECRET,
  connect,
  joinOptions,
  newRoom,
  rejectionCode,
  startHarness,
  type Harness,
} from './helpers.js';

describe('GameRoom authentication and membership', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  });

  afterEach(async () => {
    await harness.testServer.cleanup();
  });

  afterAll(async () => {
    await harness.testServer.shutdown();
  });

  it('assigns owner index 0, the lowest free player index, and sends welcome', async () => {
    const room = await newRoom(harness.testServer);
    const owner = await harness.testServer.sdk.joinById(room.roomId, await joinOptions(room, 'owner', 'owner'));
    const ownerWelcome = await owner.waitForMessage('welcome');
    const player = await harness.testServer.sdk.joinById(room.roomId, await joinOptions(room, 'player', 'player'));
    const playerWelcome = await player.waitForMessage('welcome');

    expect(ownerWelcome.you).toMatchObject({ userId: 'owner', playerIndex: 0, sessionId: owner.sessionId });
    expect(playerWelcome.you).toMatchObject({ userId: 'player', playerIndex: 1, sessionId: player.sessionId });
    expect(playerWelcome.state.pin).toEqual({ gameId: 'g_test', branchId: 'main', buildId: 'sha256:one' });
  });

  it('rejects invalid and expired grants with exact codes', async () => {
    const room = await newRoom(harness.testServer);
    const invalid = joinOptions(room, 'player', 'player', { secret: OTHER_GRANT_SECRET });
    const expired = joinOptions(room, 'player', 'player', {
      nowMs: Date.now() - (LIMITS.grantTtlSec + 60) * 1_000,
      ttlSec: 1,
    });

    expect(await rejectionCode(harness.testServer.connectTo(room, await invalid))).toBe('GRANT_INVALID');
    expect(await rejectionCode(harness.testServer.connectTo(room, await expired))).toBe('GRANT_EXPIRED');
  });

  it('rejects protocol and build mismatches with exact codes', async () => {
    const room = await newRoom(harness.testServer);

    expect(
      await rejectionCode(
        harness.testServer.connectTo(room, await joinOptions(room, 'p1', 'player', { protocol: PROTOCOL_VERSION + 1 })),
      ),
    ).toBe('PROTOCOL_MISMATCH');
    expect(
      await rejectionCode(
        harness.testServer.connectTo(room, await joinOptions(room, 'p2', 'player', { buildId: 'sha256:other' })),
      ),
    ).toBe('BUILD_MISMATCH');
  });

  it('rejects a grant for another room and a revoked jti', async () => {
    const room = await newRoom(harness.testServer);
    const otherRoom = await newRoom(harness.testServer, { gameId: 'g_other' });
    const wrongRoomOptions = await joinOptions(otherRoom, 'p1', 'player');
    const revokedOptions = await joinOptions(room, 'p2', 'player');
    const grantPayload = JSON.parse(Buffer.from(revokedOptions.grant.split('.')[1], 'base64url').toString()) as {
      jti: string;
    };
    room.revoke({ jti: grantPayload.jti });

    expect(await rejectionCode(harness.testServer.connectTo(room, wrongRoomOptions))).toBe('GRANT_INVALID');
    expect(await rejectionCode(harness.testServer.connectTo(room, revokedOptions))).toBe('GRANT_REVOKED');
  });

  it('returns ROOM_FULL after maxPlayers unique members while allowing another device for an existing member', async () => {
    const room = await newRoom(harness.testServer, { maxPlayers: 4 });
    await connect(harness.testServer, room, 'owner', 'owner');
    await connect(harness.testServer, room, 'p1', 'player');
    await connect(harness.testServer, room, 'p2', 'player');
    await connect(harness.testServer, room, 'p3', 'player');
    await connect(harness.testServer, room, 'owner', 'owner');

    expect(await rejectionCode(connect(harness.testServer, room, 'p4', 'player'))).toBe('ROOM_FULL');
  });
});
