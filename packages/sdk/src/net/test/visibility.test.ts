import type { ActionFrame, GameManifest } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { decodeBase64 } from '../codec.js';
import { createFixtureGame } from './fixture-game.js';
import { createLoopbackMatch } from './loopback.js';

const perSeatManifest = {
  inputs: { actions: { move: 'axis', jump: 'button' } },
  net: { authority: 'per-seat', maxSeats: 4, seatStateHz: 10 },
} as unknown as GameManifest;

const CANARY = 'canary-7f3a';

interface Observation {
  recipient: number;
  kind: string;
  text: string;
  bytes: number;
}

function run(options: { seats?: number; ticks?: number; redact?: boolean; spectators?: number; secret?: string }) {
  const seats = options.seats ?? 2;
  const seen: Observation[] = [];
  const games = new Map<number, ReturnType<typeof createFixtureGame>>();
  const loopback = createLoopbackMatch({
    manifest: perSeatManifest,
    seats,
    spectators: options.spectators ?? 0,
    game: (seat) => {
      const game = createFixtureGame([0, 1, 2, 3].slice(0, seats), {
        localSeat: seat,
        secret: options.secret ?? CANARY,
        redact: options.redact ?? true,
      });
      games.set(seat, game);
      return game;
    },
    link: { latencyMs: 20 },
    sniff: (recipient, kind, bytes) => {
      seen.push({ recipient, kind, text: new TextDecoder().decode(bytes), bytes: bytes.byteLength });
    },
  });
  loopback.start();
  loopback.advance(options.ticks ?? 120);
  return { loopback, seen, games };
}

/** One entry per publish the sender actually put on the wire (a broadcast lands once per recipient). */
function publishes(loopback: ReturnType<typeof createLoopbackMatch>, sender: number) {
  const unique = new Map<string, { to?: number; seq: number; data: string }>();
  for (const message of loopback.messages()) {
    if (message.type !== 'net.state' || message.sender !== sender) continue;
    const payload = message.payload as { to?: number; seq: number; data: string };
    unique.set(`${payload.seq}:${payload.to ?? 'all'}`, payload);
  }
  return [...unique.values()].sort((left, right) => left.seq - right.seq);
}

describe('per-seat visibility over the loopback harness', () => {
  it('keeps a hidden owned field out of every byte the other seat received', () => {
    const { loopback, seen, games } = run({ ticks: 120 });

    const fromSeat1 = seen.filter((observation) => observation.recipient === 0 && observation.kind === 'net.state');
    expect(fromSeat1.length).toBeGreaterThan(10);
    for (const observation of fromSeat1) expect(observation.text).not.toContain(CANARY);

    // A shape assertion as well as a substring one: the redacted slice is shorter by exactly the field's JSON.
    const longest = Math.max(...fromSeat1.map((observation) => observation.bytes));
    expect(longest).toBeLessThan(Buffer.byteLength(JSON.stringify({ secret: CANARY })) + longest);
    expect(fromSeat1.some((observation) => observation.text.includes('"secret"'))).toBe(false);

    // Privacy costs the seat that holds the value nothing: seat 1 still has its own secret locally.
    expect(games.get(1)!.owned(1)).toMatchObject({ secret: CANARY });
    loopback.dispose();
  });

  it('leaks the same field the moment a game forgets to implement view', () => {
    // The guard requirement of design §12.4: the canary has to be red when the production change is reverted.
    const { loopback, seen } = run({ ticks: 60, redact: false });

    const fromSeat1 = seen.filter((observation) => observation.recipient === 0 && observation.kind === 'net.state');
    expect(fromSeat1.length).toBeGreaterThan(0);
    expect(fromSeat1.some((observation) => observation.text.includes(CANARY))).toBe(true);
    loopback.dispose();
  });

  it('reveals only what the seat chooses to send as an event', () => {
    const { loopback } = run({ ticks: 30 });
    const events: unknown[] = [];
    loopback.seat(0).net.onEvent((event) => events.push(event));

    loopback.seat(1).net.sendEvent({ type: 'reveal', secret: CANARY });
    loopback.advance(6);

    expect(events).toEqual([{ type: 'reveal', secret: CANARY }]);
    // The reveal does not change what the next publish carries.
    const latest = publishes(loopback, 1).at(-1)!;
    expect(new TextDecoder().decode(decodeBase64(latest.data))).not.toContain(CANARY);
    loopback.dispose();
  });

  it('publishes one broadcast per publish without view and one addressed message per recipient with it', () => {
    // Three seats, so "one per recipient" and "one per publish" are different numbers and a fan-out that doubled a
    // no-`view` publish would show up.
    const plain = run({ seats: 3, ticks: 66, redact: false });
    const broadcasts = publishes(plain.loopback, 1);
    expect(broadcasts.length).toBeGreaterThanOrEqual(10);
    for (const message of broadcasts) expect(message.to).toBeUndefined();
    plain.loopback.dispose();

    const filtered = run({ seats: 3, ticks: 66 });
    const addressed = publishes(filtered.loopback, 1);
    expect(addressed).toHaveLength(broadcasts.length * 2);
    for (const message of addressed) expect(message.to).not.toBeUndefined();
    const sequences = [...new Set(addressed.map((message) => message.seq))];
    expect(sequences).toEqual(broadcasts.map((_message, index) => index + 1));
    // One sequence number per publish, shared by both of its recipients: a fan-out reorder stays orderable.
    for (const sequence of sequences) {
      const pair = addressed.filter((message) => message.seq === sequence);
      expect(pair.map((message) => message.to).sort()).toEqual([0, 2]);
      expect(new Set(pair.map((message) => message.data)).size).toBe(1);
    }
    filtered.loopback.dispose();
  });

  it('never sends state to a spectator and never asks view about one', () => {
    const viewCalls = new Map<number, Set<number>>();
    const loopback = createLoopbackMatch({
      manifest: perSeatManifest,
      seats: 2,
      spectators: 1,
      game: (seat) => {
        const game = createFixtureGame([0, 1, 2], { localSeat: seat, secret: CANARY });
        const asked = viewCalls.get(seat) ?? new Set<number>();
        viewCalls.set(seat, asked);
        const view = game.view!;
        game.view = (recipient: number) => {
          asked.add(recipient);
          return view(recipient);
        };
        return game;
      },
      link: { latencyMs: 20 },
    });
    const spectatorEvents: unknown[] = [];
    loopback.seat(2).net.onEvent((event) => spectatorEvents.push(event));
    loopback.start();
    loopback.advance(60);

    // Seat 2 is a spectator: it holds no seat, publishes nothing and receives no state.
    expect(loopback.seat(2).net.localSeat).toBeNull();
    expect(publishes(loopback, 2)).toHaveLength(0);
    const accepted = loopback.messages().filter((message) => {
      const to = (message.payload as { to?: number }).to;
      return message.type === 'net.state' && message.recipient === 2 && (to === undefined || to === 2);
    });
    expect(accepted).toHaveLength(0);
    // The other seats are publishing; the spectator's silence is its own, not an empty match.
    expect(publishes(loopback, 0).length).toBeGreaterThan(5);
    // Each seated publisher asks about the other *seated* seat and nobody else: the spectator is never a recipient.
    expect([...viewCalls.get(0)!]).toEqual([1]);
    expect([...viewCalls.get(1)!]).toEqual([0]);
    for (const asked of viewCalls.values()) expect(asked.has(2)).toBe(false);

    loopback.seat(0).net.sendEvent({ type: 'reveal', secret: CANARY });
    loopback.advance(4);
    expect(spectatorEvents).toEqual([{ type: 'reveal', secret: CANARY }]);
    loopback.dispose();
  });

  it('reconstructs the same digest on both seats while their private fields differ', () => {
    const { loopback, games } = run({ ticks: 90 });
    expect(loopback.seat(0).net.digest()).toEqual(loopback.seat(1).net.digest());
    expect(games.get(0)!.owned(0)).toMatchObject({ secret: CANARY });
    expect(games.get(1)!.owned(1)).toMatchObject({ secret: CANARY });
    loopback.dispose();
  });

  it('keeps a redacted field absent rather than zeroed when a slice is restored', () => {
    const game = createFixtureGame([0, 1], { localSeat: 0, secret: CANARY });
    game.owned(1);
    if (!game.restore) throw new Error('the fixture always implements restore');
    // A slice for seat 1 without its secret arrives at seat 0, which already holds its own reconstruction.
    game.restore({ tick: 1, state: { seat: 1, p: 42 } });
    expect(game.owned(1)).toEqual({ p: 42, score: 0, secret: CANARY });
  });

  it('keeps the fixture honest about its own step', () => {
    // Guard against a scenario that silently runs no ticks: 60 ticks at 60 Hz is 10 publishes at seatStateHz 10.
    const { loopback } = run({ ticks: 60 });
    const frames = loopback.seat(0).game.steps.flatMap((step) => step.frames);
    expect(frames.length).toBeGreaterThan(50);
    expect(frames.every((frame: ActionFrame) => frame.tick >= 0)).toBe(true);
    loopback.dispose();
  });
});
