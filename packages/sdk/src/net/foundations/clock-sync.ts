import { STEP_MS } from '../../core/clock.js';

/**
 * Clock sync, the start gate and drift resync (design §4.2).
 *
 * Within an epoch tick `t` runs at `startAt + t × STEP_MS`; the local clock never decides *when* a tick is, it only
 * decides when to ask. The offset keeps the sample with the lowest RTT, because the fastest round trip carries the
 * least queueing asymmetry — the reason NTP does the same.
 */

export const CLOCK_SAMPLE_COUNT = 8;
export const CLOCK_RESAMPLE_MS = 5_000;
export const MAX_DRIFT_TICKS = 6;

export interface ClockSample {
  /** The client's send time, echoed back in the pong. */
  clientMs: number;
  /** The server's receive time. */
  serverMs: number;
  rttMs: number;
}

export interface DriftDecision {
  resync: boolean;
  roomTick: number;
  difference: number;
}

export class ClockSync {
  private best: { offsetMs: number; rttMs: number } | undefined;
  private sampleCount = 0;
  private lastSampleMs = 0;
  private jitter = 0;

  get offsetMs(): number {
    return this.best?.offsetMs ?? 0;
  }

  get rttMs(): number {
    return this.best?.rttMs ?? 0;
  }

  get jitterMs(): number {
    return this.jitter;
  }

  get samples(): number {
    return this.sampleCount;
  }

  /** `offsetMs = serverMs - (clientMs + rtt / 2)`; only a strictly lower RTT replaces the kept sample. */
  sample(sample: ClockSample): boolean {
    if (!Number.isFinite(sample.clientMs) || !Number.isFinite(sample.serverMs) || sample.rttMs < 0) {
      throw new RangeError('clock sample must be finite with a non-negative RTT');
    }
    this.sampleCount += 1;
    this.lastSampleMs = sample.clientMs;
    if (this.best === undefined) {
      this.best = { offsetMs: sample.serverMs - (sample.clientMs + sample.rttMs / 2), rttMs: sample.rttMs };
      return true;
    }
    this.jitter = Math.abs(sample.rttMs - this.best.rttMs);
    if (sample.rttMs >= this.best.rttMs) return false;
    this.best = { offsetMs: sample.serverMs - (sample.clientMs + sample.rttMs / 2), rttMs: sample.rttMs };
    return true;
  }

  /** True when it is time for the next periodic sample (or the first eight, which run from join). */
  wantsSample(nowMs: number): boolean {
    if (this.sampleCount >= CLOCK_SAMPLE_COUNT) return nowMs - this.lastSampleMs >= CLOCK_RESAMPLE_MS;
    return true;
  }

  serverMs(nowMs: number): number {
    return nowMs + this.offsetMs;
  }

  /** The tick whose slot contains `serverMs`, given tick 0's server time. Never negative. */
  tickAt(serverMs: number, startAt: number): number {
    return Math.max(0, Math.floor((serverMs - startAt) / STEP_MS + 1e-9));
  }

  /** A difference beyond `maxDriftTicks` is a resync; one exactly at the bound is not. */
  drift(roomTick: number, localTick: number, maxDriftTicks = MAX_DRIFT_TICKS): DriftDecision {
    const difference = Math.abs(localTick - roomTick);
    return { resync: difference > maxDriftTicks, roomTick, difference };
  }
}

/**
 * The start gate. A paused clock produces zero steps and therefore no render, so the runtime calls `evaluate` from
 * `advance` before the clock moves — a gate checked only during a step would never open in a headless run (D-N2-12).
 */
export interface StartGateOptions {
  resetClock(tick: number): void;
  pauseClock(): void;
  resumeClock(): void;
}

export class StartGate {
  private startAt: number | undefined;
  private released = false;
  private releaseCount = 0;

  constructor(private readonly options: StartGateOptions) {}

  get armed(): boolean {
    return this.startAt !== undefined && !this.released;
  }

  get started(): boolean {
    return this.released;
  }

  get startServerMs(): number | undefined {
    return this.startAt;
  }

  get releases(): number {
    return this.releaseCount;
  }

  /** `net.start`: tick 0, paused, armed at `startAt`. */
  arm(startAt: number): void {
    if (!Number.isFinite(startAt)) throw new RangeError('start gate needs a finite start time');
    this.startAt = startAt;
    this.released = false;
    this.options.resetClock(0);
    this.options.pauseClock();
  }

  /** Releases exactly once, on the first evaluation at or after `startAt`. */
  evaluate(serverMs: number): boolean {
    if (this.startAt === undefined || this.released || serverMs < this.startAt) return false;
    this.released = true;
    this.releaseCount += 1;
    this.options.resumeClock();
    return true;
  }

  /** A late start: the room already began, so the match resumes at `tick` with no fast-forward. */
  skipTo(tick: number): void {
    this.startAt = undefined;
    if (this.released) return;
    this.released = true;
    this.options.resetClock(tick);
    this.options.resumeClock();
  }

  cancel(): void {
    this.startAt = undefined;
    this.released = false;
  }
}
