import type { ActionFrame, GameManifest } from '@ogm/contracts';

import { STEP_MS } from '../../core/clock.js';
import { SeededRng } from '../../core/rng.js';
import { createNetController, type GmNet, type NetController, type NetDiagnostics } from '../index.js';
import type { FixtureGame } from './fixture-game.js';

/**
 * The two-seat loopback harness (research §6): one virtual clock, one process, an injected link.
 *
 * Message delivery is ordered by `(dueAtMs, senderSeat, sequence)` and every random draw comes from a
 * `SeededRng(link.seed)` created per link pair, so the same options produce the same loss pattern and the same
 * digests. No socket, no timer, no browser and no ambient clock reading.
 */

export interface LoopbackLink {
  /** One-way, default 20. */
  latencyMs?: number;
  jitterMs?: number;
  lossPct?: number;
  reorderPct?: number;
  seed?: number;
}

export interface LoopbackOptions {
  manifest: GameManifest;
  /** 2..4 seats; seat 0 is the primary unless `primary` says otherwise. */
  seats: number;
  game(seat: number): FixtureGame;
  link?: LoopbackLink;
  /** Virtual server time of tick 0, default 1_000. */
  startAtMs?: number;
  primary?: number;
  /** Draws one local frame per seat per tick; default alternates the axis every 90 ticks. */
  input?(seat: number, tick: number): ActionFrame;
}

export interface LoopbackSeat {
  net: GmNet;
  controller: NetController;
  game: FixtureGame;
}

export interface LoopbackMatch {
  start(): void;
  advance(ticks: number): void;
  seat(n: number): LoopbackSeat;
  tick(): number;
  stats(n: number): Readonly<NetDiagnostics>;
  /** Injects drift into one seat's reconstructed shared state. */
  corrupt(seat: number, delta: number): void;
  dispose(): void;
}

interface InFlight {
  dueAtMs: number;
  sender: number;
  recipient: number;
  sequence: number;
  type: string;
  payload: unknown;
}

interface SeatClock {
  paused: boolean;
  tick: number;
}

export function createLoopbackMatch(options: LoopbackOptions): LoopbackMatch {
  const seats = options.seats;
  if (!Number.isInteger(seats) || seats < 2 || seats > 4) throw new RangeError('loopback seats must be 2..4');
  const link = options.link ?? {};
  const latencyMs = link.latencyMs ?? 20;
  const jitterMs = link.jitterMs ?? 0;
  const lossPct = link.lossPct ?? 0;
  const reorderPct = link.reorderPct ?? 0;
  const startAtMs = options.startAtMs ?? 1_000;
  const seatList = Array.from({ length: seats }, (_value, index) => index);
  // Each seat simulates tick t at `startAt + (t + inputDelayTicks) × STEP_MS`, so a frame sent at t has arrived by
  // the time t is stepped. That delay is the design's deadline (§3.3), reduced to what a loopback needs.
  const inputDelayTicks = options.manifest.net?.inputDelayTicks ?? 3;
  const rngs = new Map<string, SeededRng>();
  const clocks = new Map<number, SeatClock>();
  const queue: InFlight[] = [];
  const state = { tick: 0, sequence: 0 };
  let started = false;

  const nowMs = () => startAtMs + state.tick * STEP_MS;

  const entries = seatList.map((seat) => {
    const game = options.game(seat);
    clocks.set(seat, { paused: false, tick: 0 });
    const clock = clocks.get(seat)!;
    const controller = createNetController({
      manifest: options.manifest,
      hooks: game,
      localPlayerIndex: seat,
      send: (type, payload) => enqueue(seat, type, payload),
      acceptInput: () => undefined,
      syncPlayers: () => undefined,
      setLocalPlayerIndex: () => undefined,
      recordEvent: () => undefined,
      now: nowMs,
      pauseClock: () => {
        clock.paused = true;
      },
      resumeClock: () => {
        clock.paused = false;
      },
      resetClock: (tick) => {
        clock.tick = tick;
      },
    });
    return { seat, game, controller };
  });

  function pairRng(sender: number, recipient: number): SeededRng {
    const key = `${sender}:${recipient}`;
    let rng = rngs.get(key);
    if (!rng) {
      rng = new SeededRng(((link.seed ?? 1) * 7919 + sender * 131 + recipient * 17) | 0);
      rngs.set(key, rng);
    }
    return rng;
  }

  function enqueue(sender: number, type: string, payload: unknown): void {
    for (const recipient of seatList) {
      if (recipient === sender) continue;
      const rng = pairRng(sender, recipient);
      if (lossPct > 0 && rng.next() * 100 < lossPct) continue;
      const jitter = jitterMs > 0 ? rng.next() * jitterMs : 0;
      const reorder = reorderPct > 0 && rng.next() * 100 < reorderPct ? latencyMs : 0;
      queue.push({
        dueAtMs: nowMs() + latencyMs + jitter + reorder,
        sender,
        recipient,
        sequence: ++state.sequence,
        type,
        payload,
      });
    }
  }

  function deliver(): void {
    const due = queue
      .filter((message) => message.dueAtMs <= nowMs() + 1e-9)
      .sort(
        (left, right) =>
          left.dueAtMs - right.dueAtMs || left.sender - right.sender || left.sequence - right.sequence,
      );
    for (const message of due) {
      const index = queue.indexOf(message);
      if (index >= 0) queue.splice(index, 1);
      entries.find((entry) => entry.seat === message.recipient)?.controller.handleMessage(
        message.type,
        message.payload,
      );
    }
  }

  const defaultInput = (seat: number, tick: number): ActionFrame => ({
    playerIndex: seat,
    tick,
    source: 'network',
    actions: { move: Math.floor(tick / 90) % 2 === 0 ? 1 : -1, jump: tick % 150 === 0 },
  });

  function stepSeat(entry: (typeof entries)[number]): void {
    const clock = clocks.get(entry.seat)!;
    entry.controller.gate(nowMs());
    if (clock.paused) return;

    // Sample for the current wall tick and simulate the tick `inputDelayTicks` behind it, so this seat's frame
    // reaches the others before they step that tick.
    entry.controller.sampleLocal((options.input ?? defaultInput)(entry.seat, state.tick));

    const dueTick = state.tick - inputDelayTicks;
    if (clock.tick >= dueTick) return;
    clock.tick += 1;
    const tick = clock.tick;
    const frames: ActionFrame[] = [];
    entry.controller.beforeStep(tick, frames);
    entry.game.step(tick, frames);
    entry.controller.afterStep(tick);
    entry.controller.render();
  }

  return {
    start() {
      started = true;
      const seatsMessage = seatList.map((seat) => ({
        seat,
        userId: `user-${seat}`,
        name: `Player ${seat + 1}`,
        team: 0,
        connected: true,
        ready: true,
        forfeited: false,
        spectator: false,
      }));
      for (const entry of entries) {
        entry.controller.handleMessage('net.start', {
          epoch: 'epoch-1',
          seed: 12_345,
          startAt: startAtMs,
          tick: 0,
          primary: options.primary ?? 0,
          seats: seatsMessage,
          privateSeed: 9_876_543,
        });
      }
    },
    advance(ticks) {
      if (!started) throw new Error('loopback match must start before it advances');
      for (let index = 0; index < ticks; index += 1) {
        state.tick += 1;
        deliver();
        for (const entry of entries) stepSeat(entry);
      }
    },
    seat(seat) {
      const entry = entries[seat];
      if (!entry) throw new RangeError(`no loopback seat ${seat}`);
      return { net: entry.controller.net, controller: entry.controller, game: entry.game };
    },
    tick() {
      return state.tick;
    },
    stats(seat) {
      const entry = entries[seat];
      if (!entry) throw new RangeError(`no loopback seat ${seat}`);
      return entry.controller.diagnostics;
    },
    corrupt(seat, delta) {
      const entry = entries[seat];
      if (!entry) throw new RangeError(`no loopback seat ${seat}`);
      entry.game.corrupt(delta);
    },
    dispose() {
      for (const entry of entries) entry.controller.dispose();
      queue.length = 0;
    },
  };
}
