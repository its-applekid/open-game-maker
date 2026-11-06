import type { InputFrame } from '@ogm/contracts';

import { STEP_MS } from '../../core/clock.js';

/**
 * Tick-stamped redundant inputs (design §4.3).
 *
 * At 30 Hz each packet carries the sender's frames for the last three ticks, so two consecutive lost packets do not
 * leave a gap. Received frames go into a per-seat ring keyed by tick; the first write wins because a retransmission is
 * identical by construction. A frame that arrives after its tick was already simulated is stored (the owner's next
 * published state supersedes the reconstruction anyway) and counted, never re-simulated.
 */

export const INPUT_REDUNDANCY = 3;
export const INPUT_HISTORY_TICKS = 120;
export const INPUT_SEND_EVERY_TICKS = 2;
export const DEFAULT_INPUT_DELAY_TICKS = 3;
export const MIN_INPUT_DELAY_TICKS = 2;
export const MAX_INPUT_DELAY_TICKS = 8;

export interface InputRingsOptions {
  seats?: readonly number[];
  historyTicks?: number;
  redundancy?: number;
  sendEveryTicks?: number;
}

/** The wire frame plus the seat that sent it; the room stamps `seat` with the authenticated sender. */
export type StampedFrame = InputFrame & { seat: number };

export interface CollectedFrame {
  frame: StampedFrame | undefined;
  /** No frame stamped `tick` existed: the last known frame was repeated, or nothing was known at all. */
  gapped: boolean;
}

export class InputRings {
  private readonly rings = new Map<number, Map<number, StampedFrame>>();
  private readonly simulated = new Map<number, number>();
  private readonly historyTicks: number;
  private readonly redundancy: number;
  private readonly sendEveryTicks: number;
  private gapCount = 0;
  private lateCount = 0;

  constructor(options: InputRingsOptions = {}) {
    this.historyTicks = options.historyTicks ?? INPUT_HISTORY_TICKS;
    this.redundancy = options.redundancy ?? INPUT_REDUNDANCY;
    this.sendEveryTicks = options.sendEveryTicks ?? INPUT_SEND_EVERY_TICKS;
    for (const seat of options.seats ?? []) this.addSeat(seat);
  }

  get inputGaps(): number {
    return this.gapCount;
  }

  get lateInputs(): number {
    return this.lateCount;
  }

  get redundancyTicks(): number {
    return this.redundancy;
  }

  get cadenceTicks(): number {
    return this.sendEveryTicks;
  }

  addSeat(seat: number): void {
    if (!this.rings.has(seat)) this.rings.set(seat, new Map());
  }

  setSeats(seats: readonly number[]): void {
    for (const seat of seats) this.addSeat(seat);
    for (const seat of [...this.rings.keys()]) if (!seats.includes(seat)) this.rings.delete(seat);
  }

  /** True once a tick has been handed to the game step; a later frame for it is late. */
  markSimulated(seat: number, tick: number): void {
    const current = this.simulated.get(seat);
    if (current === undefined || tick > current) this.simulated.set(seat, tick);
  }

  record(frame: StampedFrame): 'stored' | 'duplicate' | 'late' {
    if (!Number.isInteger(frame.seat) || frame.seat < 0) throw new RangeError('input frame seat must be a seat index');
    const ring = this.ringFor(frame.seat, frame);
    if (!ring) return 'duplicate';

    const simulated = this.simulated.get(frame.seat);
    const late = simulated !== undefined && frame.tick <= simulated;
    ring.set(frame.tick, frame);
    this.prune(ring, frame.tick);
    if (late) {
      this.lateCount += 1;
      return 'late';
    }
    return 'stored';
  }

  /** The window a 30 Hz send carries for local tick `tick`: frames `t`, `t-1`, `t-2`, newest first. */
  window(seat: number, tick: number): StampedFrame[] {
    const frames: StampedFrame[] = [];
    for (let offset = 0; offset < this.redundancy; offset += 1) {
      const frame = this.frameFor(seat, tick - offset);
      if (frame) frames.push(frame);
    }
    return frames;
  }

  frameFor(seat: number, tick: number): StampedFrame | undefined {
    if (tick < 0) return undefined;
    return this.rings.get(seat)?.get(tick);
  }

  /** The newest frame at or before `tick`, which is what a gap repeats. */
  lastAtOrBefore(seat: number, tick: number): StampedFrame | undefined {
    const ring = this.rings.get(seat);
    if (!ring) return undefined;
    for (let index = tick; index >= 0; index -= 1) {
      const frame = ring.get(index);
      if (frame) return frame;
    }
    return undefined;
  }

  /**
   * What the step for `tick` applies for `seat`: the stamped frame when the ring has it, otherwise the seat's last
   * known frame, which counts as a gap.
   */
  collect(seat: number, tick: number): CollectedFrame {
    const stamped = this.frameFor(seat, tick);
    if (stamped) return { frame: stamped, gapped: false };
    const previous = this.lastAtOrBefore(seat, tick);
    this.gapCount += 1;
    return { frame: previous, gapped: true };
  }

  /** Server time by which tick `tick` must be simulated: `startAt + (tick + inputDelayTicks) × STEP_MS`. */
  deadlineFor(tick: number, startAt: number, inputDelayTicks: number): number {
    return startAt + (tick + inputDelayTicks) * STEP_MS;
  }

  dispose(): void {
    this.rings.clear();
    this.simulated.clear();
  }

  private ringFor(seat: number, frame: StampedFrame): Map<number, StampedFrame> | undefined {
    let ring = this.rings.get(seat);
    if (!ring) {
      ring = new Map();
      this.rings.set(seat, ring);
    }
    if (ring.has(frame.tick)) return undefined;
    return ring;
  }

  private prune(ring: Map<number, StampedFrame>, newest: number): void {
    const oldest = newest - this.historyTicks;
    for (const tick of ring.keys()) if (tick < oldest) ring.delete(tick);
  }
}
