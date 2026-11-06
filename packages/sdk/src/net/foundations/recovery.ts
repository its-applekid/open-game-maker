/**
 * Recovery bookkeeping, and the desync breaker (design §4.6, D-N2-7).
 *
 * A recovery loop is a game-bug amplifier: a wrong `digest()` turns into unbounded traffic the moment two seats
 * disagree, so the breaker lives here rather than in the four-client harness.
 */

export const RECOVERY_PER_SEC = 4;
export const RECOVERY_WINDOW_MS = 1_000;
export const MAX_REPLAY_TICKS = 120;
export const MAX_RESYNCS = 3;
export const RESYNC_WINDOW_MS = 60_000;

export type RecoveryScope = 'shared' | 'seat' | 'events';

export interface RecoveryRequest {
  scope: RecoveryScope;
  tick: number;
  seat?: number;
}

export interface RecoveryPlan {
  mode: 'replay' | 'hard';
  /** Ticks the local buffer has to replay; `undefined` means the snapshot is already at the current tick. */
  replayTicks?: number;
}

export class RecoveryBook {
  private readonly outstanding = new Map<RecoveryScope, RecoveryRequest>();
  private readonly sentAt: number[] = [];
  private readonly resyncsAt: number[] = [];
  private recoveryCount = 0;
  private hardResyncCount = 0;
  private desyncFlag = false;

  get recoveries(): number {
    return this.recoveryCount;
  }

  get hardResyncs(): number {
    return this.hardResyncCount;
  }

  get desynced(): boolean {
    return this.desyncFlag;
  }

  get pending(): readonly RecoveryRequest[] {
    return [...this.outstanding.values()];
  }

  /**
   * One request per scope: the oldest outstanding request wins, and a full per-second window drops the request
   * entirely. `undefined` means nothing was sent.
   */
  request(scope: RecoveryScope, tick: number, nowMs: number, seat?: number): RecoveryRequest | undefined {
    if (this.desyncFlag || this.outstanding.has(scope) || !this.takeRateSlot(nowMs)) return undefined;
    const request: RecoveryRequest = seat === undefined ? { scope, tick } : { scope, tick, seat };
    this.outstanding.set(scope, request);
    this.recoveryCount += 1;
    return request;
  }

  /** A response arrived: the scope's slot frees immediately rather than waiting out the window. */
  settle(scope: RecoveryScope): void {
    this.outstanding.delete(scope);
  }

  /** Replay the local buffer when the gap is short enough; otherwise continue from the snapshot. */
  plan(snapshotTick: number, currentTick: number): RecoveryPlan {
    const replayTicks = currentTick - snapshotTick;
    if (replayTicks <= 0) return { mode: 'hard' };
    if (replayTicks > MAX_REPLAY_TICKS) return { mode: 'hard', replayTicks };
    return { mode: 'replay', replayTicks };
  }

  /**
   * Records a hard resync and trips the breaker on the fourth one inside sixty seconds. A tripped breaker stops
   * requesting recoveries and reports the seat desynced.
   */
  recordResync(nowMs: number): void {
    this.hardResyncCount += 1;
    this.resyncsAt.push(nowMs);
    while (this.resyncsAt.length > 0 && this.resyncsAt[0]! < nowMs - RESYNC_WINDOW_MS) this.resyncsAt.shift();
    if (this.resyncsAt.length > MAX_RESYNCS) this.desyncFlag = true;
  }

  /** A new epoch starts clean: recovery state never spans a match. */
  reset(): void {
    this.outstanding.clear();
    this.sentAt.length = 0;
    this.resyncsAt.length = 0;
    this.recoveryCount = 0;
    this.hardResyncCount = 0;
    this.desyncFlag = false;
  }

  private takeRateSlot(nowMs: number): boolean {
    while (this.sentAt.length > 0 && this.sentAt[0]! <= nowMs - RECOVERY_WINDOW_MS) this.sentAt.shift();
    if (this.sentAt.length >= RECOVERY_PER_SEC) return false;
    this.sentAt.push(nowMs);
    return true;
  }
}
