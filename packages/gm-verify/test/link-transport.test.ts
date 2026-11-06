import {
  ALL_SEATS,
  type ChannelName,
  type Transport,
  type TransportHandlers,
  type TransportStats,
} from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { BAD_LINK, CLEAN_LINK, type LinkConfig } from '../src/link/schedule.js';
import { LinkTransport, type LinkClock } from '../src/link/transport.js';

type Sent = { channel: ChannelName; bytes: number; first: number; at: number };
type Received = { channel: ChannelName; seat: number; bytes: number; first: number; at: number };

/** A clock the test advances by hand: no timers, no wall clock, no flake. */
function fakeClock(): LinkClock & { advance(ms: number): void; pending(): number } {
  let now = 0;
  let seq = 0;
  const timers: { at: number; seq: number; run: () => void }[] = [];

  return {
    now: () => now,
    later(ms, run) {
      const timer = { at: now + ms, seq, run };
      seq += 1;
      timers.push(timer);
      return () => {
        const index = timers.indexOf(timer);
        if (index >= 0) timers.splice(index, 1);
      };
    },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = timers
          .filter((timer) => timer.at <= target)
          .sort((left, right) => left.at - right.at || left.seq - right.seq)[0];
        if (!due) break;
        timers.splice(timers.indexOf(due), 1);
        now = due.at;
        due.run();
      }
      now = target;
    },
    pending: () => timers.length,
  };
}

/** Stands in for the room client's transport: it records what reached it, in the order and at the time it did. */
function fakeInner(now: () => number) {
  const sent: Sent[] = [];
  const opens: string[] = [];
  const closes: string[] = [];
  let handlers: TransportHandlers | undefined;

  const inner: Transport = {
    kind: 'ws-relay',
    seat: ALL_SEATS,
    open(next) {
      handlers = next;
      opens.push('open');
      return Promise.resolve();
    },
    send(channel, bytes) {
      sent.push({ channel, bytes: bytes.length, first: bytes[0] ?? -1, at: now() });
    },
    stats(): TransportStats {
      return {
        kind: 'ws-relay',
        rttMs: 5,
        jitterMs: 1,
        lossPct: 0,
        bytesOut: 0,
        bytesIn: 0,
        drops: 0,
        connectedMs: 100,
      };
    },
    close(reason) {
      closes.push(reason);
    },
  };

  return {
    inner,
    sent,
    opens,
    closes,
    receive: (channel: ChannelName, bytes: Uint8Array, seat = 0) => handlers?.message(channel, seat, bytes),
  };
}

function link(config: LinkConfig) {
  const clock = fakeClock();
  const inner = fakeInner(() => clock.now());
  const transport = new LinkTransport({ inner: inner.inner, config, clock });
  const received: Received[] = [];

  return {
    transport,
    inner,
    clock,
    received,
    async open() {
      await transport.open({
        message: (channel, seat, bytes) =>
          received.push({ channel, seat, bytes: bytes.length, first: bytes[0] ?? -1, at: clock.now() }),
        stats: () => undefined,
        closed: () => undefined,
      });
    },
  };
}

const fill = (length: number, first = 7): Uint8Array => new Uint8Array(length).fill(first);

describe('the link decorator', () => {
  it('hands a message to the real transport after exactly the configured latency when jitter is zero', async () => {
    const harness = link({ ...CLEAN_LINK, latencyMs: 40, jitterMs: 0 });
    await harness.open();

    harness.transport.send('input', fill(4));
    expect(harness.inner.sent).toHaveLength(0);

    harness.clock.advance(39);
    expect(harness.inner.sent).toHaveLength(0);

    harness.clock.advance(1);
    expect(harness.inner.sent).toEqual([{ channel: 'input', bytes: 4, first: 7, at: 40 }]);
    expect(harness.transport.stats().lastDelayMs).toBe(40);
  });

  it('keeps every delivery inside latency plus or minus jitter', async () => {
    const harness = link({ ...BAD_LINK, lossPct: 0, reorderPct: 0 });
    await harness.open();

    /* One message per millisecond, so the send time of message N is N. */
    for (let index = 0; index < 50; index += 1) {
      harness.transport.send('input', fill(2));
      harness.clock.advance(1);
    }
    harness.clock.advance(200);

    const delays = harness.inner.sent.map((delivery, index) => delivery.at - index);
    expect(harness.inner.sent).toHaveLength(50);
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(BAD_LINK.latencyMs - BAD_LINK.jitterMs);
    expect(Math.max(...delays)).toBeLessThanOrEqual(BAD_LINK.latencyMs + BAD_LINK.jitterMs);
  });

  it('never hands the real transport a message the schedule dropped', async () => {
    const harness = link({ ...BAD_LINK, lossPct: 100, reorderPct: 0 });
    await harness.open();

    harness.transport.send('input', fill(3));
    harness.clock.advance(500);

    expect(harness.inner.sent).toEqual([]);
    expect(harness.transport.stats().appliedDrops).toBe(1);
    expect(harness.transport.stats().drops).toBe(1);
  });

  it('keeps the event channel in send order even at a 50 % reorder rate', async () => {
    const harness = link({ ...BAD_LINK, lossPct: 0, reorderPct: 50 });
    await harness.open();

    for (let index = 0; index < 100; index += 1) {
      harness.transport.send('event', new Uint8Array([index]));
      harness.clock.advance(7);
    }
    harness.clock.advance(500);

    expect(harness.inner.sent).toHaveLength(100);
    expect(harness.inner.sent.map((delivery) => delivery.first)).toEqual(
      Array.from({ length: 100 }, (_, index) => index),
    );
    expect(harness.transport.stats().reordered).toBe(0);
  });

  it('lets a reordered input overtake the message sent after it', async () => {
    const harness = link({ ...BAD_LINK, lossPct: 0, reorderPct: 50 });
    await harness.open();

    for (let index = 0; index < 100; index += 1) {
      harness.transport.send('input', new Uint8Array([index]));
      harness.clock.advance(7);
    }
    harness.clock.advance(500);

    const order = harness.inner.sent.map((delivery) => delivery.first);
    const inversions = order.filter((value, position) => value !== position).length;
    expect(order).toHaveLength(100);
    expect(inversions).toBeGreaterThan(0);
    expect(harness.transport.stats().reordered).toBeGreaterThan(0);
  });

  it('reports the drops and the delivered bytes it applied', async () => {
    const harness = link({ ...BAD_LINK, lossPct: 5, reorderPct: 0 });
    await harness.open();

    for (let index = 0; index < 200; index += 1) harness.transport.send('input', fill(10));
    harness.clock.advance(1_000);

    const stats = harness.transport.stats();
    expect(stats.sent).toBe(200);
    expect(stats.delivered).toBe(harness.inner.sent.length);
    expect(stats.appliedDrops).toBe(200 - harness.inner.sent.length);
    expect(stats.drops).toBe(200 - harness.inner.sent.length);
    expect(stats.bytesOut).toBe(harness.inner.sent.length * 10);
    expect(stats.kind).toBe('ws-relay');
    expect(stats.rttMs).toBe(5);
    expect(harness.transport.seat).toBe(ALL_SEATS);
  });

  it('closes the inner transport on a scheduled drop and reopens it after downMs', async () => {
    const harness = link(CLEAN_LINK);
    await harness.open();

    harness.transport.drop(3_000);
    expect(harness.inner.closes).toEqual(['link-drop']);
    expect(harness.inner.opens).toHaveLength(1);

    harness.clock.advance(2_999);
    expect(harness.inner.opens).toHaveLength(1);

    harness.clock.advance(1);
    await Promise.resolve();
    expect(harness.inner.opens).toHaveLength(2);
  });

  it('drops a send that arrives after close, without counting it against the link', async () => {
    const harness = link(CLEAN_LINK);
    await harness.open();

    harness.transport.close('done');
    harness.transport.send('input', fill(4));
    harness.clock.advance(100);

    expect(harness.inner.sent).toEqual([]);
    expect(harness.inner.closes).toEqual(['done']);
    expect(harness.transport.stats().sent).toBe(0);
  });

  it('forwards what the real transport receives, with the sending seat', async () => {
    const harness = link(CLEAN_LINK);
    await harness.open();

    harness.inner.receive('state', fill(6, 3), 2);
    expect(harness.received).toEqual([{ channel: 'state', seat: 2, bytes: 6, first: 3, at: 0 }]);
  });
});
