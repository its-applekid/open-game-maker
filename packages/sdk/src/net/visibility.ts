import type { MultiplayerHooksV2, NetStatePayload, Snapshot } from '@ogm/contracts';

import { encodeBase64, packJson } from './codec.js';

/**
 * Per-seat visibility (netcode §5.2, `docs/research/500-seat-views.md` §3.1–§3.2, §4.2).
 *
 * A publish is one encode per recipient, not one broadcast: `view(seat)` is called on the sending client and exactly
 * what it returns is what that seat receives. Everything here is pure — the caller owns the tick, the sequence number
 * and the transport — so a game's filtering is testable without a room, a socket or a clock.
 */

/** Kept equal to `NET_LIMITS.seatStateBytes` without importing room code into a template's browser bundle. */
export const SEAT_STATE_BUDGET = 8_192;

const dataChars = (bytes: number) => Math.ceil(bytes / 3) * 4;

/** The contract's own `net.state` payload, with the recipient optional: absent means "everyone, unfiltered". */
export type SeatStateMessage = Omit<NetStatePayload, 'to'> & { to?: number };

export interface VisibilityOptions {
  hooks: MultiplayerHooksV2;
  localSeat: number;
  /** Ascending seats that may receive this client's state; never the local seat, never a spectator. */
  recipients(): readonly number[];
  /** Called at most once per kind by the caller's own warn-once (`per-seat.ts`), never per frame. */
  warn?(kind: 'view' | 'oversized', message: string): void;
}

export interface SeatStateEnvelope {
  epoch: string;
  tick: number;
  /** One counter per sending seat, shared by every recipient of this publish so a fan-out can be ordered. */
  seq: number;
}

export interface SeatStateBatch {
  messages: SeatStateMessage[];
  /** Recipients whose `view()` threw or whose slice could not be encoded; the others still got their message. */
  failures: number;
  /** The subset of `failures` that were over the wire budget, for the sender's `oversized` diagnostic. */
  oversized: number;
}

/**
 * The payload `seat` may receive from this client: `view(seat)`, or — for a game that declares no visibility — the
 * sending seat's own owned slice. The default is the *sender's* seat, not the recipient's: a seat publishes what it
 * owns, and every other reading either duplicates the world or publishes a slice labelled as another seat's.
 */
export function payloadFor(options: VisibilityOptions, seat: number): Snapshot {
  const view = options.hooks.view;
  if (view) return view(seat);
  const slice = options.hooks.capture?.({ seat: options.localSeat });
  if (!slice) throw new TypeError('net.state has no payload: net.capture({ seat }) returned nothing');
  return slice;
}

/**
 * One publish becomes one message per recipient when the game implements `view`, and one broadcast when it does not
 * (the no-`view` path stays the N2 path, byte for byte). Every payload is captured before any is encoded, in ascending
 * seat order, so a `view` that reads mutable state sees one tick for every recipient.
 */
export function encodeSeatState(options: VisibilityOptions, envelope: SeatStateEnvelope): SeatStateBatch {
  const recipients = [...options.recipients()].sort((left, right) => left - right);
  if (recipients.length === 0) return { messages: [], failures: 0, oversized: 0 };

  if (typeof options.hooks.view !== 'function') {
    const data = encodeBase64(packJson(payloadFor(options, options.localSeat), SEAT_STATE_BUDGET, 'seat state'));
    if (data.length > dataChars(SEAT_STATE_BUDGET)) throw new RangeError('seat state exceeds its wire budget');
    return {
      messages: [{ epoch: envelope.epoch, seat: options.localSeat, seq: envelope.seq, tick: envelope.tick, data }],
      failures: 0,
      oversized: 0,
    };
  }

  // Capture every recipient's payload first: a `view` that mutated between recipients would hand two of them bytes
  // from two different ticks.
  const captured: { seat: number; payload: Snapshot }[] = [];
  const messages: SeatStateMessage[] = [];
  let failures = 0;
  let oversized = 0;
  for (const seat of recipients) {
    try {
      captured.push({ seat, payload: payloadFor(options, seat) });
    } catch (error) {
      failures += 1;
      options.warn?.('view', `gm.net dropped net.state for seat ${seat}: view() threw ${String(error)}`);
    }
  }

  for (const { seat, payload } of captured) {
    let data: string;
    try {
      data = encodeBase64(packJson(payload, SEAT_STATE_BUDGET, 'seat state'));
      if (data.length > dataChars(SEAT_STATE_BUDGET)) throw new RangeError('seat state exceeds its wire budget');
    } catch (error) {
      failures += 1;
      oversized += 1;
      options.warn?.('oversized', `gm.net dropped an oversized net.state for seat ${seat}: ${String(error)}`);
      continue;
    }
    messages.push({
      epoch: envelope.epoch,
      seat: options.localSeat,
      seq: envelope.seq,
      tick: envelope.tick,
      to: seat,
      data,
    });
  }

  return { messages, failures, oversized };
}
