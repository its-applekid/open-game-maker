/**
 * The per-pair statistics of `docs/plans/netcode-platform.md` §6.4 (N4, #498).
 *
 * Every estimator here is fed by a transport and read by the selector; none of them talks to a clock of its own, so a
 * test can drive them with a list of samples and an injected `now`.
 */

/**
 * Minimum round trip over a ring of the last `size` samples.
 *
 * A minimum filter, not a mean: a queue in the browser, a GC pause or a retransmit only ever *adds* delay, so the
 * smallest recent sample is the closest estimate of the path's own cost.
 */
export class RttEstimator {
  private readonly samples: number[] = [];

  constructor(private readonly size = 10) {}

  add(sampleMs: number): void {
    if (!Number.isFinite(sampleMs) || sampleMs < 0) return;
    this.samples.push(sampleMs);
    if (this.samples.length > this.size) this.samples.splice(0, this.samples.length - this.size);
  }

  get ms(): number {
    return this.samples.length === 0 ? 0 : Math.min(...this.samples);
  }

  get count(): number {
    return this.samples.length;
  }

  reset(): void {
    this.samples.length = 0;
  }
}

/** Mean absolute successive difference of the round trip samples, RFC 3550's estimator without its smoothing. */
export class JitterEstimator {
  private previous?: number;
  private total = 0;
  private count = 0;

  add(sampleMs: number): void {
    if (!Number.isFinite(sampleMs) || sampleMs < 0) return;
    if (this.previous !== undefined) {
      this.total += Math.abs(sampleMs - this.previous);
      this.count += 1;
    }
    this.previous = sampleMs;
  }

  get ms(): number {
    return this.count === 0 ? 0 : this.total / this.count;
  }

  reset(): void {
    this.previous = undefined;
    this.total = 0;
    this.count = 0;
  }
}

/**
 * Loss as a fraction of the sequence numbers a window should have carried.
 *
 * WebSocket never reports a drop, so the only honest signal is a gap in the sequence the sender stamped. It is the same
 * estimator the diagnostics overlay needs, which is why it lives in the transport rather than in the overlay.
 */
export class LossEstimator {
  private first?: number;
  private highest?: number;
  private received = 0;
  private windowStart?: number;

  constructor(private readonly windowMs = 5_000) {}

  observe(seq: number, atMs: number): void {
    if (!Number.isInteger(seq) || seq < 0) return;
    if (this.windowStart === undefined) this.windowStart = atMs;
    if (atMs - this.windowStart >= this.windowMs) this.roll(atMs);
    if (this.first === undefined || seq < this.first) this.first = seq;
    if (this.highest === undefined || seq > this.highest) this.highest = seq;
    this.received += 1;
  }

  /** Loss over the current window; a silent window keeps reporting the one before it, because nothing rolled it. */
  get pct(): number {
    const expected = this.expected();
    if (expected <= 0) return 0;
    return round2(Math.min(100, Math.max(0, ((expected - this.received) / expected) * 100)));
  }

  reset(): void {
    this.first = undefined;
    this.highest = undefined;
    this.received = 0;
    this.windowStart = undefined;
  }

  private expected(): number {
    if (this.first === undefined || this.highest === undefined) return 0;
    return this.highest - this.first + 1;
  }

  private roll(atMs: number): void {
    this.first = undefined;
    this.highest = undefined;
    this.received = 0;
    this.windowStart = atMs;
  }
}

/** A median over a sliding window; the selector uses it so one spike never moves a pair. */
export class WindowedStats {
  private readonly entries: Array<{ atMs: number; value: number }> = [];
  private aboveSince?: number;
  private lastValue = 0;

  constructor(private readonly windowMs = 5_000) {}

  observe(value: number, atMs: number): void {
    if (!Number.isFinite(value)) return;
    this.entries.push({ atMs, value });
    this.lastValue = value;
    this.trim(atMs);
  }

  /** Median of the samples inside the window; a window with no traffic reports its last value, never 0. */
  get p50(): number {
    if (this.entries.length === 0) return this.lastValue;
    const sorted = this.entries.map((entry) => entry.value).sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  }

  /**
   * How long the windowed median has been above `threshold`, or 0 when it is not.
   *
   * The demote rule needs this rather than the pair's age: a pair connected for a minute must still be given
   * `demoteWindowMs` of bad measurement before it is demoted.
   */
  msAbove(threshold: number, atMs: number): number {
    this.trim(atMs);
    if (this.p50 <= threshold) {
      this.aboveSince = undefined;
      return 0;
    }
    this.aboveSince ??= atMs;
    return atMs - this.aboveSince;
  }

  reset(): void {
    this.entries.length = 0;
    this.aboveSince = undefined;
    this.lastValue = 0;
  }

  private trim(atMs: number): void {
    const oldest = atMs - this.windowMs;
    let drop = 0;
    while (drop < this.entries.length && this.entries[drop]!.atMs < oldest) drop += 1;
    if (drop > 0) this.entries.splice(0, drop);
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
