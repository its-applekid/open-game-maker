import type { ActionFrame, MultiplayerHooks, MultiplayerHooksV2, Snapshot } from '@ogm/contracts';

import { toUnits } from '../foundations/checksum.js';

/**
 * The deterministic fixture game every loopback scenario runs (research §6).
 *
 * Its state is the smallest shape that can disagree: one integer position and score per seat (owned), one round and
 * one board sum (shared). Nothing here reads time or randomness; the harness feeds the step whole ticks.
 */

export interface FixtureSeatState {
  p: number;
  score: number;
}

export interface FixtureSnapshot {
  tick: number;
  seat?: number;
  p?: number;
  score?: number;
  round?: number;
  boardSum?: number;
}

export interface FixtureGame extends MultiplayerHooks, MultiplayerHooksV2 {
  /** The fixed step: applies this tick's frames in the order they were handed over. */
  step(tick: number, frames: readonly ActionFrame[]): void;
  /** Every `(tick, frames)` the step saw, so a scenario can prove a local frame landed in its own tick. */
  steps: readonly { tick: number; frames: ActionFrame[] }[];
  /** One unit of drift injected into the shared state, for the recovery scenario. */
  corrupt(delta: number): void;
  /** The owned slice for `seat`, for a scenario that corrupts one seat's reconstruction. */
  owned(seat: number): FixtureSeatState;
  shared(): { round: number; boardSum: number };
  tick(): number;
  /** How many slices this game has had restored, so a scenario can prove a recovery landed. */
  restores(): number;
}

export function createFixtureGame(seats: readonly number[]): FixtureGame {
  const owned = new Map<number, FixtureSeatState>();
  const spawned = new Set<number>();
  let round = 0;
  let boardSum = 0;
  let tick = 0;
  let restoreCount = 0;
  const steps: { tick: number; frames: ActionFrame[] }[] = [];

  for (const seat of seats) {
    owned.set(seat, { p: 0, score: 0 });
    spawned.add(seat);
  }

  const game: FixtureGame = {
    steps,
    step(stepTick, frames) {
      tick = stepTick;
      steps.push({ tick: stepTick, frames: frames.map((frame) => structuredClone(frame)) });
      for (const frame of frames) {
        const state = owned.get(frame.playerIndex);
        if (!state) continue;
        const move = axisOf(frame.actions.move);
        state.p += move;
        boardSum += move;
        if (frame.actions.jump === true) state.score += 1;
      }
      round = Math.floor(stepTick / 300);
    },
    spawn(playerIndex) {
      if (!owned.has(playerIndex)) owned.set(playerIndex, { p: 0, score: 0 });
      spawned.add(playerIndex);
    },
    despawn(playerId) {
      const seat = Number.parseInt(playerId.replace(/^p/u, ''), 10);
      owned.delete(seat);
      spawned.delete(seat);
    },
    snapshot() {
      return { tick, state: { owned: [...owned.entries()].map(([seat, state]) => ({ seat, ...state })) } };
    },
    applySnapshot(snapshot) {
      const state = snapshot.state as { owned?: { seat: number; p: number; score: number }[] };
      for (const entry of state.owned ?? []) owned.set(entry.seat, { p: entry.p, score: entry.score });
      tick = snapshot.tick;
    },
    hud(playerIndex) {
      return { p: owned.get(playerIndex)?.p ?? 0, score: owned.get(playerIndex)?.score ?? 0 };
    },
    capture(scope): Snapshot {
      if (scope.seat === undefined) return { tick, state: { round, boardSum } };
      const state = owned.get(scope.seat) ?? { p: 0, score: 0 };
      return { tick, state: { seat: scope.seat, p: state.p, score: state.score } };
    },
    restore(snapshot: Snapshot): void {
      restoreCount += 1;
      const state = snapshot.state as FixtureSnapshot;
      if (state.seat !== undefined) {
        owned.set(state.seat, { p: state.p ?? 0, score: state.score ?? 0 });
        return;
      }
      round = state.round ?? round;
      boardSum = state.boardSum ?? boardSum;
    },
    digest(): readonly number[] {
      const words = [toUnits(tick)];
      for (const seat of [...owned.keys()].sort((left, right) => left - right)) {
        const state = owned.get(seat)!;
        words.push(toUnits(state.p), toUnits(state.score));
      }
      words.push(toUnits(round), toUnits(boardSum));
      return words;
    },
    corrupt(delta) {
      boardSum += delta;
    },
    owned(seat) {
      return { ...(owned.get(seat) ?? { p: 0, score: 0 }) };
    },
    shared() {
      return { round, boardSum };
    },
    tick() {
      return tick;
    },
    restores() {
      return restoreCount;
    },
  };

  return game;
}

function axisOf(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value !== null && 'x' in value && typeof value.x === 'number') return value.x;
  return 0;
}
