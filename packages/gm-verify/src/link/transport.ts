import type { ChannelName, Transport, TransportHandlers, TransportKind, TransportStats } from '@ogm/contracts';

import { createLinkSchedule, isImpaired, type LinkConfig } from './schedule.js';

/**
 * Bad-network simulation, the imperative half (netcode platform §8.3, research #499 §3.7).
 *
 * A decorator over the channel-typed `Transport` seam: it applies the seeded schedule from `schedule.ts` to what this
 * seat sends, through a clock it is given rather than one it reads. Nothing here references a game, a room or a browser,
 * so the unit test drives it with a fake clock and no timers.
 *
 * Impairment is per sender: each seat wraps its own transport, so a message crosses the link once. The inner transport's
 * own socket, framing and reconnect path are untouched — the simulator sits above the room socket, never inside it.
 */

/** The minimal clock the decorator needs; `later` returns a cancel handle. */
export type LinkClock = { now(): number; later(ms: number, run: () => void): () => void };

export type LinkTransportOptions = {
  inner: Transport;
  config: LinkConfig;
  clock: LinkClock;
};

export type LinkTransportStats = TransportStats & {
  /** Messages the simulator refused. Counted apart from `inner.drops`, which is the socket's own loss. */
  appliedDrops: number;
  /** Messages held back past the next one on the same channel. */
  reordered: number;
  /** The delay applied to the most recent delivered message. */
  lastDelayMs: number;
  /** Messages handed to `send`, and the ones that reached the handler. */
  sent: number;
  delivered: number;
};

export class LinkTransport implements Transport {
  private readonly inner: Transport;
  private readonly config: LinkConfig;
  private readonly clock: LinkClock;
  private readonly decide: (
    channel: ChannelName,
    index: number,
  ) => { dropped: boolean; delayMs: number; reordered: boolean };
  private readonly sends: Record<ChannelName, number> = { input: 0, state: 0, event: 0 };
  private readonly pendingDue: Record<ChannelName, number> = { input: 0, state: 0, event: 0 };
  private readonly timers = new Set<() => void>();
  private handlers: TransportHandlers | undefined;
  private sent = 0;
  private delivered = 0;
  private dropped = 0;
  private outOfOrder = 0;
  private bytesOut = 0;
  private lastDelayMs = 0;

  constructor(options: LinkTransportOptions) {
    this.inner = options.inner;
    this.config = options.config;
    this.clock = options.clock;
    this.decide = createLinkSchedule(options.config);
  }

  get kind(): TransportKind {
    return this.inner.kind;
  }

  get appliedDrops(): number {
    return this.dropped;
  }

  async open(handlers: TransportHandlers): Promise<void> {
    this.handlers = handlers;
    await this.inner.open({
      message: (channel, bytes) => handlers.message(channel, bytes),
      stats: (stats) => handlers.stats({ ...stats, ...this.counters(stats) }),
      closed: (reason) => handlers.closed(reason),
    });
  }

  send(channel: ChannelName, bytes: Uint8Array): void {
    const decision = this.decide(channel, this.sends[channel]!);
    this.sends[channel] = this.sends[channel]! + 1;
    this.sent += 1;

    if (decision.dropped) {
      this.dropped += 1;
      return;
    }

    const now = this.clock.now();
    let due = now + decision.delayMs;
    if (decision.reordered) {
      /* Held back one jitter window, so the next message on this channel overtakes it. */
      due += Math.max(1, this.config.latencyMs + this.config.jitterMs);
      this.outOfOrder += 1;
    }
    /*
     * `event` is reliable and ordered per sender (§6.1): its due times only ever move forward, so a jittered delay can
     * never deliver one event before an earlier one.
     */
    if (!isImpaired(channel)) due = Math.max(due, this.pendingDue.event);
    this.pendingDue[channel] = due;

    const cancel = this.clock.later(due - now, () => {
      this.timers.delete(cancel);
      this.delivered += 1;
      this.bytesOut += bytes.length;
      this.lastDelayMs = this.clock.now() - now;
      this.handlers?.message(channel, bytes);
    });
    this.timers.add(cancel);
  }

  stats(): LinkTransportStats {
    return { ...this.counters(this.inner.stats()) };
  }

  close(reason: string): void {
    for (const cancel of [...this.timers]) cancel();
    this.timers.clear();
    this.inner.close(reason);
  }

  /**
   * Closes the inner transport now and reopens it after `downMs`. The reconnect path is the caller's: the harness drives
   * its own resume token when `closed` fires, the way a real tunnel drop does.
   */
  drop(downMs: number): void {
    this.inner.close('link-drop');
    const cancel = this.clock.later(downMs, () => {
      this.timers.delete(cancel);
      const handlers = this.handlers;
      if (!handlers) return;
      void this.inner
        .open({
          message: (channel, bytes) => handlers.message(channel, bytes),
          stats: (stats) => handlers.stats({ ...stats, ...this.counters(stats) }),
          closed: (reason) => handlers.closed(reason),
        })
        .catch((error: unknown) => handlers.closed(error instanceof Error ? error.message : String(error)));
    });
    this.timers.add(cancel);
  }

  /** Send-side numbers are the decorator's — it is the only sender — and receive-side numbers pass through. */
  private counters(inner: TransportStats): LinkTransportStats {
    return {
      ...inner,
      bytesOut: this.bytesOut,
      drops: inner.drops + this.dropped,
      appliedDrops: this.dropped,
      reordered: this.outOfOrder,
      lastDelayMs: this.lastDelayMs,
      sent: this.sent,
      delivered: this.delivered,
    };
  }
}
