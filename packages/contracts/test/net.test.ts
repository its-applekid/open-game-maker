import { describe, expect, it } from 'vitest';

import { gameManifestSchema } from '../src/game.js';
import {
  AUTHORITY_MODES,
  NET_LIMITS,
  netManifestSchema,
  netMessageSchema,
  netMessagesSchema,
  netSeatSchema,
  netStartSchema,
} from '../src/net.js';
import { loadJson } from './helpers.js';
import { emittedValidator } from './json-schema.js';

const messagesJson = emittedValidator('net.messages.v2');
const startJson = emittedValidator('net.start.v2');
const seatJson = emittedValidator('net.seat.v2');

describe('net contract', () => {
  it('round-trips every v2 wire message through Zod and the emitted schema', () => {
    const batch = loadJson('fixtures/net/messages.json');
    expect(netMessagesSchema.safeParse(batch).success).toBe(true);
    expect(messagesJson(batch)).toBe(true);
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

  it('caps seats at the emitted limit in Zod and in the emitted schema', () => {
    const start = loadJson<{ seats: unknown[] } & Record<string, unknown>>('fixtures/net/start.json');
    expect(netStartSchema.safeParse(start).success).toBe(true);
    expect(startJson(start)).toBe(true);
    expect(seatJson(loadJson('fixtures/net/seat.json'))).toBe(true);

    const tooMany = {
      ...(start as Record<string, unknown>),
      seats: Array(NET_LIMITS.maxSeats + 1).fill(start.seats[0]),
    };
    expect(netStartSchema.safeParse(tooMany).success).toBe(false);
    expect(startJson(tooMany)).toBe(false);
  });

  it('rejects an oversized batch and a frame the room would reject', () => {
    const frame = { seq: 1, tick: 1, axes: [], buttons: 0 };
    const message = { t: 'net.inputs', epoch: 'epoch-7', seat: 0, firstTick: 1, frames: [frame] };
    const tooMany = Array(NET_LIMITS.maxBatchMessages + 1).fill(message);
    expect(netMessagesSchema.safeParse(tooMany).success).toBe(false);
    expect(messagesJson(tooMany)).toBe(false);

    const withText = { ...message, frames: [{ ...frame, text: 'hi' }] };
    expect(netMessagesSchema.safeParse([withText]).success).toBe(false);
    expect(messagesJson([withText])).toBe(false);
  });

  it('carries manifest.net through the game manifest, and refuses a bad one there too', () => {
    const manifest = loadJson('fixtures/game.v1.json') as Record<string, unknown>;
    expect(gameManifestSchema.safeParse({ ...manifest, net: { authority: 'per-seat', maxSeats: 4 } }).success).toBe(
      true,
    );
    expect(gameManifestSchema.safeParse({ ...manifest, net: { authority: 'per-seat', maxSeats: 9 } }).success).toBe(
      false,
    );
    const seat = loadJson<Record<string, unknown>>('fixtures/net/seat.json');
    expect(netSeatSchema.safeParse({ ...seat, seat: 8 }).success).toBe(false);
  });
});
