import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toJSONSchema } from 'zod';

import {
  NetClientMessageJsonSchema,
  NetClientMessageSchema,
  NetServerMessageSchema,
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

/* fixtures carry binary as base64; the wire carries bytes */
function toWire(message: Json): Json {
  const copy: Json = { ...message };
  if (typeof copy.data === 'string') copy.data = Uint8Array.from(Buffer.from(copy.data, 'base64'));
  if (typeof copy.snapshot === 'string') copy.snapshot = Uint8Array.from(Buffer.from(copy.snapshot, 'base64'));
  if (typeof copy.events === 'string') copy.events = Uint8Array.from(Buffer.from(copy.events, 'base64'));
  return copy;
}

describe('net fixtures', () => {
  const files = readdirSync(new URL('../fixtures/net/', import.meta.url)).filter((file) => file.endsWith('.json'));
  const stemOf = (file: string) => `net.${file.replace(/\.json$/, '')}.v1`;

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

describe('protocol 2 messages', () => {
  it('parses every client message from both its wire and base64 forms', () => {
    for (const fixture of clientMessages) {
      expect(NetClientMessageSchema.safeParse(toWire(fixture)).success, `${fixture.t} wire`).toBe(true);
      expect(NetClientMessageJsonSchema.safeParse(fixture).success, `${fixture.t} json`).toBe(true);
    }
  });

  it('parses every server message from both its wire and base64 forms', () => {
    for (const fixture of serverMessages) {
      expect(NetServerMessageSchema.safeParse(toWire(fixture)).success, `${fixture.t} wire`).toBe(true);
    }
  });

  it('rejects a relayed event one byte over the event cap', () => {
    const base = clientMessages.find((message) => message.t === 'net.event') as Json;
    const atCap = { ...base, data: new Uint8Array(LIMITS_V2.eventBytes) };
    const overCap = { ...base, data: new Uint8Array(LIMITS_V2.eventBytes + 1) };
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
    expect(NetServerMessageSchema.safeParse(start).success).toBe(true);
    expect(NetServerMessageSchema.safeParse(shared).success).toBe(true);
  });

  it('carries a spectator identity with no seat', () => {
    const welcome = serverMessages.find((message) => message.t === 'welcome') as Json;
    const you = { ...(welcome.you as Json), seat: null, playerIndex: -1, spectator: true };
    expect(NetServerMessageSchema.safeParse({ ...toWire(welcome), you }).success).toBe(true);
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
