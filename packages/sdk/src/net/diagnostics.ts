/**
 * The two diagnostics N6 adds to `NetDiagnostics` (netcode platform §8.1, research #499 §4.2). Everything else the
 * per-seat table reports already exists in N2's set or comes from the room state and the transport.
 */

/** How many deliveries the event-delay p95 looks back over: 120 samples is ~2 s at the room's event rate. */
export const EVENT_DELAY_SAMPLES = 120;

/**
 * A bounded ring of event-delivery delays.
 *
 * The delay N6 records is the one this client can see: how long an event that arrived from the room waited before it was
 * handed to the game. The wire carries no sender timestamp — adding one would change the room's validated `net.event`
 * envelope — and a sender never receives its own event, so an end-to-end number is not measurable from one seat. What is
 * measurable is the part the channel is actually judged on: an event that waits for a missing predecessor shows up here
 * as a spike, which is exactly the failure a gap produces.
 */
export class EventDelayRing {
  private readonly values: number[] = [];

  constructor(readonly capacity: number = EVENT_DELAY_SAMPLES) {}

  /** Ignores a negative or non-finite sample: a clock that went backwards is not a delivery delay. */
  add(delayMs: number): void {
    if (!Number.isFinite(delayMs) || delayMs < 0) return;
    this.values.push(delayMs);
    if (this.values.length > this.capacity) this.values.splice(0, this.values.length - this.capacity);
  }

  get latest(): number {
    return this.values.at(-1) ?? 0;
  }

  /** Nearest rank: `ceil(0.95 × n)`, so one bad sample in twenty cannot hide inside an average. */
  get p95(): number {
    if (this.values.length === 0) return 0;
    const sorted = [...this.values].sort((left, right) => left - right);
    const rank = Math.ceil(0.95 * sorted.length);
    return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!;
  }

  get samples(): number {
    return this.values.length;
  }
}
