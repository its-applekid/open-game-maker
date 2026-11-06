import { LIMITS_V2 } from './room.js';

/*
 * "A duplicated `net.event` is applied once" (#497 §3.5, D-N3-15).
 *
 * The room relays and never dedupes — a relay that deduped would be interpreting. The inbox lives here,
 * in a browser-safe module with no Node-only import, so the room's tests, the SDK and the bridge all run
 * the same code. Per-sender sequence numbers are the only ordering the transport guarantees.
 */

export type InboxResult = 'applied' | 'duplicate' | 'gap';
export type InboxEvent = { from: number; id: string; seq: number };
export type MissingEvents = { from: number; seqs: number[] };

type Stream = { started: boolean; highest: number; ids: string[]; missing: number[] };

export class EventInbox {
  private readonly streams = new Map<number, Stream>();

  constructor(private readonly history: number = LIMITS_V2.eventHistory) {}

  /**
   * Records one received event. `'duplicate'` means this `(from, id)` was already applied and the caller
   * must not apply it again; `'gap'` means it applies but earlier sequence numbers from that sender are
   * missing, so `missing()` should drive a `net.recovery.request { scope: 'events', seat }`.
   */
  apply(event: InboxEvent): InboxResult {
    const stream = this.stream(event.from);
    if (stream.ids.includes(event.id)) return 'duplicate';
    stream.ids.push(event.id);
    if (stream.ids.length > this.history) stream.ids.splice(0, stream.ids.length - this.history);

    const gapAt = stream.missing.indexOf(event.seq);
    if (gapAt >= 0) stream.missing.splice(gapAt, 1);

    if (!stream.started) {
      stream.started = true;
      stream.highest = event.seq;
      return 'applied';
    }
    if (event.seq > stream.highest + 1) {
      for (let seq = stream.highest + 1; seq < event.seq; seq += 1) {
        if (!stream.missing.includes(seq)) stream.missing.push(seq);
      }
      if (stream.missing.length > this.history) stream.missing.splice(0, stream.missing.length - this.history);
      stream.highest = event.seq;
      return 'gap';
    }
    stream.highest = Math.max(stream.highest, event.seq);
    return 'applied';
  }

  /** Senders with unrecovered sequence numbers, oldest first, for the recovery request. */
  missing(): MissingEvents[] {
    const result: MissingEvents[] = [];
    for (const [from, stream] of this.streams) {
      if (stream.missing.length > 0) result.push({ from, seqs: [...stream.missing].sort((a, b) => a - b) });
    }
    return result;
  }

  /** A new epoch is a new event space: every sender restarts its sequence at 1. */
  reset(): void {
    this.streams.clear();
  }

  private stream(from: number): Stream {
    const existing = this.streams.get(from);
    if (existing !== undefined) return existing;
    const created: Stream = { started: false, highest: 0, ids: [], missing: [] };
    this.streams.set(from, created);
    return created;
  }
}
