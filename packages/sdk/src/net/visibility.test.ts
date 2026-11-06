import type { MultiplayerHooksV2, Snapshot } from '@ogm/contracts';
import { describe, expect, it, vi } from 'vitest';

import { decodeBase64, unpackJson } from './codec.js';
import { encodeSeatState, payloadFor, type VisibilityOptions } from './visibility.js';

const base: MultiplayerHooksV2 = {
  spawn() {},
  despawn() {},
  snapshot: () => ({ tick: 0, state: {} }),
  applySnapshot() {},
  hud: () => ({ p: 0, score: 0 }),
};

function options(overrides: Partial<VisibilityOptions> = {}): VisibilityOptions {
  const hooks: MultiplayerHooksV2 = {
    ...base,
    capture: (scope) => ({ tick: 4, state: { seat: scope.seat, p: 7, score: 1, private: 'canary-7f3a' } }),
    ...overrides.hooks,
  };
  return {
    hooks,
    localSeat: 1,
    recipients: () => [0, 2],
    ...overrides,
  };
}

const envelope = { epoch: 'e1', tick: 4, seq: 9 };

describe('per-recipient seat state', () => {
  it('publishes one broadcast, without `to`, when the game declares no view', () => {
    const batch = encodeSeatState(options(), envelope);

    expect(batch.messages).toHaveLength(1);
    expect(batch.failures).toBe(0);
    expect(batch.messages[0]).not.toHaveProperty('to');
    expect(batch.messages[0]).toMatchObject({ epoch: 'e1', seat: 1, seq: 9, tick: 4 });
    // The default is the *sender's* own slice: a seat publishes what it owns.
    expect(unpackJson<Snapshot>(decodeBase64(batch.messages[0]!.data))).toEqual({
      tick: 4,
      state: { seat: 1, p: 7, score: 1, private: 'canary-7f3a' },
    });
  });

  it('encodes one message per recipient, in ascending seat order, on one sequence number', () => {
    const calls: number[] = [];
    const batch = encodeSeatState(
      options({
        hooks: {
          ...base,
          capture: () => ({ tick: 4, state: {} }),
          view: (seat: number) => {
            calls.push(seat);
            return { tick: 4, state: { seat, narrow: true } };
          },
        },
      }),
      envelope,
    );

    expect(calls).toEqual([0, 2]);
    expect(batch.messages).toHaveLength(2);
    expect(batch.messages.map((message) => message.to)).toEqual([0, 2]);
    expect(batch.messages.map((message) => message.seq)).toEqual([9, 9]);
    expect(unpackJson<Snapshot>(decodeBase64(batch.messages[0]!.data))).toEqual({
      tick: 4,
      state: { seat: 0, narrow: true },
    });
  });

  it('leaves the owner its own field and hands every other recipient the smaller payload', () => {
    const withSecret = { tick: 4, state: { seat: 1, p: 7, private: 'canary-7f3a' } };
    const withoutSecret = { tick: 4, state: { seat: 1, p: 7 } };
    const batch = encodeSeatState(
      options({
        hooks: {
          ...base,
          capture: () => withSecret,
          view: (seat: number) => (seat === 1 ? withSecret : withoutSecret),
        },
        recipients: () => [0, 1],
      }),
      envelope,
    );

    const toOwner = batch.messages.find((message) => message.to === 1)!;
    const toOther = batch.messages.find((message) => message.to === 0)!;
    expect(toOther.data.length).toBeLessThan(toOwner.data.length);
    expect(new TextDecoder().decode(decodeBase64(toOther.data))).not.toContain('canary-7f3a');
  });

  it('isolates a recipient whose view throws and counts it once', () => {
    const warn = vi.fn();
    const batch = encodeSeatState(
      options({
        hooks: {
          ...base,
          capture: () => ({ tick: 4, state: {} }),
          view: (seat: number) => {
            if (seat === 0) throw new Error('boom');
            return { tick: 4, state: { seat } };
          },
        },
        warn,
      }),
      envelope,
    );

    expect(batch.messages.map((message) => message.to)).toEqual([2]);
    expect(batch.failures).toBe(1);
    expect(batch.oversized).toBe(0);
    expect(warn).toHaveBeenCalledExactlyOnceWith('view', expect.stringContaining('boom'));
  });

  it('isolates a recipient whose slice is over the wire budget', () => {
    const warn = vi.fn();
    const huge = { tick: 4, state: { filler: 'x'.repeat(9 * 1_024) } };
    const batch = encodeSeatState(
      options({
        hooks: {
          ...base,
          capture: () => ({ tick: 4, state: {} }),
          view: (seat: number) => (seat === 0 ? huge : { tick: 4, state: { seat } }),
        },
        warn,
      }),
      envelope,
    );

    expect(batch.messages.map((message) => message.to)).toEqual([2]);
    expect(batch.failures).toBe(1);
    expect(batch.oversized).toBe(1);
    expect(warn).toHaveBeenCalledExactlyOnceWith('oversized', expect.stringContaining('seat 0'));
  });

  it('publishes nothing when no seat may receive state', () => {
    const batch = encodeSeatState(options({ recipients: () => [] }), envelope);
    expect(batch).toEqual({ messages: [], failures: 0, oversized: 0 });
  });

  it('falls back to the sender’s owned slice when capture is missing', () => {
    const hooks: MultiplayerHooksV2 = { ...base, view: () => ({ tick: 1, state: { redacted: true } }) };
    expect(payloadFor(options({ hooks }), 0)).toEqual({ tick: 1, state: { redacted: true } });
    expect(() => payloadFor(options({ hooks: { ...base } }), 0)).toThrow('net.capture');
  });
});
