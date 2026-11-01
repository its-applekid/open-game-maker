import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toJSONSchema } from 'zod';

import {
  ClientMessageSchema,
  DesignTxSchema,
  InputFrameSchema,
  JoinRejectionSchema,
  LIMITS,
  NetGameToHostSchema,
  NetHostToGameSchema,
  RoomGrantSchema,
  RoomStateSchema,
  ServerMessageSchema,
  roomSchemas as schemas,
} from '../src/room.js';
import { loadJson } from './helpers.js';

type Stem = keyof typeof schemas;
type Json = Record<string, unknown>;

const grant = loadJson<Json>('fixtures/room/grant.json');
const state = loadJson<Json>('fixtures/room/state.json');
const designTx = loadJson<Json>('fixtures/room/design-tx.json');
const clientMessages = loadJson<Json[]>('fixtures/room/client-messages.json');
const serverMessages = loadJson<Json[]>('fixtures/room/server-messages.json');

/* fixtures carry binary as base64; the wire carries bytes */
function toWire(message: Json): Json {
  return typeof message.data === 'string'
    ? { ...message, data: Uint8Array.from(Buffer.from(message.data, 'base64')) }
    : message;
}

function tsOf(messages: Json[]): unknown[] {
  return messages.map((message) => message.t).sort();
}

describe('room fixtures', () => {
  const files = readdirSync(new URL('../fixtures/room/', import.meta.url)).filter((file) => file.endsWith('.json'));
  const stemOf = (file: string) => `room.${file.replace(/\.json$/, '')}.v1` as Stem;

  it('has one fixture per emitted room schema', () => {
    expect(files.map(stemOf).sort()).toEqual(Object.keys(schemas).sort());
  });

  it.each(files)('room/%s parses with its schema and round-trips', (file) => {
    const doc = loadJson(`fixtures/room/${file}`);
    const result = schemas[stemOf(file)].safeParse(doc);
    expect(result.error?.issues ?? [], file).toEqual([]);
    expect(result.data).toEqual(doc);
  });

  it.each(Object.keys(schemas))('%s emitted schema is current', (stem) => {
    const emitted = JSON.parse(readFileSync(new URL(`../schemas/${stem}.json`, import.meta.url), 'utf8')) as Json;
    expect(emitted).toEqual({
      ...toJSONSchema(schemas[stem as Stem], { target: 'draft-2020-12' }),
      $id: `https://open-game-maker-2000.local/schemas/${stem}.json`,
    });
  });

  it('covers every message type exactly once', () => {
    expect(tsOf(clientMessages)).toEqual([
      'design.tx',
      'draft.load',
      'draft.ready',
      'event',
      'input',
      'kick',
      'phase',
      'ping',
      'presence',
      'snapshot',
    ]);
    expect(tsOf(serverMessages)).toEqual([
      'design.tx',
      'ended',
      'event',
      'input',
      'pong',
      'resync',
      'snapshot',
      'welcome',
    ]);
  });
});

describe('room grant', () => {
  it('rejects a role outside owner | player (no anonymous guests)', () => {
    expect(RoomGrantSchema.safeParse({ ...grant, role: 'guest' }).success).toBe(false);
  });

  it('caps exp at 10 minutes after iat', () => {
    const iat = (grant.exp as number) - 660;
    expect(RoomGrantSchema.safeParse({ ...grant, iat }).success).toBe(false);
    expect(RoomGrantSchema.safeParse({ ...grant, iat: (grant.exp as number) - 600 }).success).toBe(true);
  });

  it('requires a jti for revocation', () => {
    const { jti: _jti, ...withoutJti } = grant;
    expect(RoomGrantSchema.safeParse(withoutJti).success).toBe(false);
  });
});

describe('room state', () => {
  it('holds maxPlayers to the ceiling of 8', () => {
    expect(RoomStateSchema.safeParse({ ...state, maxPlayers: 9 }).success).toBe(false);
    expect(RoomStateSchema.safeParse({ ...state, maxPlayers: 8 }).success).toBe(true);
  });

  it('rejects a join rejection code outside the protocol', () => {
    expect(JoinRejectionSchema.safeParse({ code: 'ROOM_FULL', max: 4 }).success).toBe(true);
    expect(JoinRejectionSchema.safeParse({ code: 'NOPE' }).success).toBe(false);
  });
});

describe('input frame', () => {
  it('rejects free text on the input channel', () => {
    expect(InputFrameSchema.safeParse({ seq: 1, tick: 1, axes: [], buttons: 0, text: 'hi' }).success).toBe(false);
  });
});

describe('design tx', () => {
  it('keeps T08 transaction fields it does not own', () => {
    const parsed = DesignTxSchema.parse(designTx);
    expect(parsed).toMatchObject({ id: 'tx_01J', leaseToken: 'lease_01J', inverse: designTx.inverse });
  });

  it.each([['/prompt/text'], [['prompt', 'text']], ['entities/e1'], [[]]])('rejects patch path %j', (path) => {
    const tx = { ...designTx, patches: [{ op: 'replace', path, value: 1 }] };
    expect(DesignTxSchema.safeParse(tx).success).toBe(false);
  });

  it.each([['/entities/e1/props/x'], ['/globals'], [['globals', 'gravity']]])('accepts patch path %j', (path) => {
    const tx = { ...designTx, patches: [{ op: 'replace', path, value: 1 }] };
    expect(DesignTxSchema.safeParse(tx).success).toBe(true);
  });
});

describe('wire messages', () => {
  it('parse the fixtures with binary fields as bytes', () => {
    for (const message of clientMessages) expect(ClientMessageSchema.parse(toWire(message))).toEqual(toWire(message));
    for (const message of serverMessages) expect(ServerMessageSchema.parse(toWire(message))).toEqual(toWire(message));
  });

  it('accept an ArrayBuffer and hand back a Uint8Array', () => {
    const parsed = ClientMessageSchema.parse({ t: 'event', seq: 1, data: new Uint8Array([1, 2]).buffer });
    expect(parsed).toEqual({ t: 'event', seq: 1, data: new Uint8Array([1, 2]) });
  });

  it('reject a snapshot over 64 KiB and an event over 16 KiB', () => {
    const snapshot = { t: 'snapshot', seq: 1, tick: 1, data: new Uint8Array(LIMITS.snapshotBytes + 1) };
    expect(ClientMessageSchema.safeParse(snapshot).success).toBe(false);
    expect(
      ClientMessageSchema.safeParse({ t: 'event', seq: 1, data: new Uint8Array(LIMITS.eventBytes + 1) }).success,
    ).toBe(false);
  });

  it('accept a partial presence update', () => {
    expect(ClientMessageSchema.parse({ t: 'presence', p: { privateMode: true } })).toEqual({
      t: 'presence',
      p: { privateMode: true },
    });
  });

  it('carry the net.* payloads between host app and game', () => {
    const f = { seq: 1, tick: 2, axes: [1], buttons: 0 };
    expect(NetHostToGameSchema.parse({ t: 'net.input', f: { ...f, playerIndex: 1 } })).toBeTruthy();
    expect(NetHostToGameSchema.parse({ t: 'phase', phase: 'pausedForHost' })).toBeTruthy();
    expect(NetGameToHostSchema.parse({ t: 'net.input', f })).toBeTruthy();
    expect(NetGameToHostSchema.safeParse({ t: 'net.role', role: 'host' }).success).toBe(false);
  });
});

describe('LIMITS', () => {
  it('matches the T07 caps consumers rely on', () => {
    expect(LIMITS).toEqual({
      inputBytes: 256,
      snapshotBytes: 64 * 1024,
      snapshotPerSec: 30,
      eventBytes: 16 * 1024,
      eventPerSec: 30,
      designTxBytes: 64 * 1024,
      designTxPerSec: 30,
      presencePerSec: 15,
      grantTtlSec: 600,
      ownerReconnectSec: 120,
      playerReconnectSec: 60,
      idleDisposeSec: 300,
      maxPlayersDefault: 4,
      maxPlayersCeiling: 8,
    });
  });
});
