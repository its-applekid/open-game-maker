import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toJSONSchema } from 'zod';

import { gameManifestSchema } from '../src/game.js';
import {
  AUTHORITY_MODES,
  NetClientMessageSchema,
  NetServerMessageSchema,
  netManifestSchema,
  netMessageSchema,
  netMessagesSchema,
  netSeatSchema,
  netStartSchema,
  RoomClientMessageSchema,
  RoomServerMessageSchema,
  RoomStateV2Schema,
  netSchemas as schemas,
} from '../src/net.js';
import {
  JoinOptionsSchema,
  JoinRejectionSchema,
  LIMITS_V2,
  PROTOCOL_VERSION,
  PROTOCOL_VERSION_V1,
  RoomStateSchema,
} from '../src/room.js';
import { loadJson } from './helpers.js';

type Json = Record<string, unknown>;

const clientMessages = loadJson<Json[]>('fixtures/net/client-messages.json');
const serverMessages = loadJson<Json[]>('fixtures/net/server-messages.json');
const roomState = loadJson<Json>('fixtures/net/room-state.json');
const start = loadJson<Json>('fixtures/net/start.json');

const epoch = '6f1c0f7e-0d2b-4a1e-9d54-2b6a1c9c3f11';

describe('net fixtures', () => {
  const files = readdirSync(new URL('../fixtures/net/', import.meta.url)).filter((file) => file.endsWith('.json'));
  const stemOf = (file: string) => `net.${file.replace(/\.json$/, '')}.v2`;

  it('has one fixture per emitted net schema', () => {
    expect(files.map(stemOf).sort()).toEqual(Object.keys(schemas).sort());
  });

  it.each(files)('net/%s parses with its schema', (file) => {
    const result = schemas[stemOf(file) as keyof typeof schemas].safeParse(loadJson(`fixtures/net/${file}`));
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it.each(Object.keys(schemas))('%s emitted schema is current', (stem) => {
    const emitted = JSON.parse(readFileSync(new URL(`../schemas/${stem}.json`, import.meta.url), 'utf8')) as Json;
    expect(emitted).toEqual({
      ...toJSONSchema(schemas[stem as keyof typeof schemas], { target: 'draft-2020-12' }),
      $id: `https://open-game-maker-2000.local/schemas/${stem}.json`,
    });
  });
});

describe('net contract', () => {
  it('round-trips every relayed v2 wire message through Zod', () => {
    const batch = loadJson('fixtures/net/messages.json');
    expect(netMessagesSchema.safeParse(batch).success).toBe(true);
    for (const message of batch as unknown[]) {
      expect(netMessageSchema.safeParse(message).success).toBe(true);
    }
  });

  it('names the authority modes the manifest vocabulary accepts', () => {
    expect(AUTHORITY_MODES).toEqual(['per-seat', 'host', 'rollback']);
    expect(netManifestSchema.safeParse({ authority: 'per-seat', maxSeats: 4 }).success).toBe(true);
    expect(netManifestSchema.safeParse({ authority: 'server', maxSeats: 4 }).success).toBe(false);
    expect(netManifestSchema.safeParse({ maxSeats: 4 }).success).toBe(true);
  });

  it('caps seats at the emitted limit and refuses a seat out of range', () => {
    expect(netStartSchema.safeParse(start).success).toBe(true);
    const tooMany = { ...start, seats: Array(LIMITS_V2.maxPlayersCeiling + 1).fill((start.seats as Json[])[0]) };
    expect(netStartSchema.safeParse(tooMany).success).toBe(false);

    const seat = loadJson<Json>('fixtures/net/seat.json');
    expect(netSeatSchema.safeParse(seat).success).toBe(true);
    expect(netSeatSchema.safeParse({ ...seat, seat: LIMITS_V2.maxPlayersCeiling }).success).toBe(false);
  });

  it('rejects an oversized batch and a frame the room would reject', () => {
    const frame = { seq: 1, tick: 1, axes: [], buttons: 0 };
    const message = { t: 'net.inputs', epoch: 'epoch-7', seat: 0, firstTick: 1, frames: [frame] };
    const tooMany = Array(LIMITS_V2.maxBatchMessages + 1).fill(message);
    expect(netMessagesSchema.safeParse(tooMany).success).toBe(false);

    const withText = { ...message, frames: [{ ...frame, text: 'hi' }] };
    expect(netMessagesSchema.safeParse([withText]).success).toBe(false);
  });

  it('carries manifest.net through the game manifest, and refuses a bad one there too', () => {
    const manifest = loadJson('fixtures/game.v1.json') as Json;
    expect(gameManifestSchema.safeParse({ ...manifest, net: { authority: 'per-seat', maxSeats: 4 } }).success).toBe(
      true,
    );
    expect(gameManifestSchema.safeParse({ ...manifest, net: { authority: 'per-seat', maxSeats: 9 } }).success).toBe(
      false,
    );
  });
});

describe('protocol 2 messages', () => {
  it('parses every client message and every server message from its fixture', () => {
    for (const fixture of clientMessages) {
      expect(NetClientMessageSchema.safeParse(fixture).success, `${fixture.t}`).toBe(true);
    }
    for (const fixture of serverMessages) {
      expect(NetServerMessageSchema.safeParse(fixture).success, `${fixture.t}`).toBe(true);
    }
  });

  it('rejects a relayed event one character over the event cap', () => {
    const base = clientMessages.find((message) => message.t === 'net.event') as Json;
    const atCap = { ...base, data: 'A'.repeat(Math.ceil(LIMITS_V2.eventBytes / 3) * 4) };
    const overCap = { ...base, data: 'A'.repeat(Math.ceil(LIMITS_V2.eventBytes / 3) * 4 + 4) };
    expect(NetClientMessageSchema.safeParse(atCap).success).toBe(true);
    expect(NetClientMessageSchema.safeParse(overCap).success).toBe(false);
  });

  it('rejects a batched input message over the frame cap', () => {
    const frame = { seq: 1, tick: 1, axes: [], buttons: 0 };
    const frames = Array.from({ length: LIMITS_V2.inputFramesPerMessage }, () => frame);
    const message = { t: 'net.inputs', epoch, seat: 0, firstTick: 1, frames };
    expect(NetClientMessageSchema.safeParse(message).success).toBe(true);
    expect(NetClientMessageSchema.safeParse({ ...message, frames: [...frames, frame] }).success).toBe(false);
  });

  it('rejects an unknown key, so a client cannot smuggle state through an envelope', () => {
    const ready = { t: 'net.ready', ready: true };
    expect(NetClientMessageSchema.safeParse(ready).success).toBe(true);
    expect(NetClientMessageSchema.safeParse({ ...ready, seat: 2 }).success).toBe(false);
  });

  it('covers both protocols through the room-wide unions', () => {
    expect(
      RoomClientMessageSchema.safeParse({ t: 'input', f: { seq: 1, tick: 1, axes: [], buttons: 0 } }).success,
    ).toBe(true);
    expect(RoomClientMessageSchema.safeParse({ t: 'net.ready', ready: false }).success).toBe(true);
    expect(RoomClientMessageSchema.safeParse({ t: 'net.ready' }).success).toBe(false);
    expect(RoomServerMessageSchema.safeParse({ t: 'ended', reason: 'host-left' }).success).toBe(true);
    expect(RoomServerMessageSchema.safeParse({ t: 'ended', reason: 'abandoned' }).success).toBe(true);
  });

  it('keeps the v1 room state strict while the v2 state carries the seat table', () => {
    expect(RoomStateV2Schema.safeParse(roomState).success).toBe(true);
    expect(RoomStateSchema.safeParse(roomState).success).toBe(false);
    const { seats, spectators, epoch: _epoch, startAt, pausedAt, primarySeat, seed, rulesetHash, ...v1 } = roomState;
    expect({ seats, spectators, startAt, pausedAt, primarySeat, seed, rulesetHash }).toBeDefined();
    expect(RoomStateSchema.safeParse(v1).success).toBe(true);
  });

  it('accepts a net.start copy with and without the per-seat private seed', () => {
    const { privateSeed: _privateSeed, ...shared } = start;
    expect(NetServerMessageSchema.safeParse({ t: 'net.start', ...start }).success).toBe(true);
    expect(NetServerMessageSchema.safeParse({ t: 'net.start', ...shared }).success).toBe(true);
  });

  it('carries a spectator identity with no seat', () => {
    const welcome = serverMessages.find((message) => message.t === 'welcome') as Json;
    const you = { ...(welcome.you as Json), seat: null, playerIndex: -1, spectator: true };
    expect(NetServerMessageSchema.safeParse({ ...welcome, you }).success).toBe(true);
  });
});

describe('protocol 2 join surface', () => {
  const base = { grant: 'grant', buildId: 'sha256-3f9a', protocol: PROTOCOL_VERSION };

  it('keeps a v1 join valid and accepts the two optional v2 claims', () => {
    expect(JoinOptionsSchema.safeParse({ ...base, protocol: PROTOCOL_VERSION_V1 }).success).toBe(true);
    expect(JoinOptionsSchema.safeParse(base).success).toBe(true);
    expect(JoinOptionsSchema.safeParse({ ...base, seat: 2, rulesetHash: 'fnv1a64:aa' }).success).toBe(true);
    expect(JoinOptionsSchema.safeParse({ ...base, seat: 8 }).success).toBe(false);
  });

  it('names the two new rejection codes', () => {
    expect(JoinRejectionSchema.safeParse({ code: 'SEAT_TAKEN', seat: 1 }).success).toBe(true);
    expect(JoinRejectionSchema.safeParse({ code: 'RULESET_MISMATCH', expected: 'fnv1a64:aa' }).success).toBe(true);
  });
});
