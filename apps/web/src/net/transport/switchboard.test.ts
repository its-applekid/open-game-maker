import { describe, expect, it } from 'vitest';

import { encodeEventFrame, encodeInputFrame } from './frames';
import { createSwitchboard, type TransportNotice } from './index';
import { FakeSignalBus, FakeTransport } from './test-support';

/**
 * The per-room switchboard (#498 §4.1, §7.5). The relay is the default and the fallback; a pair is promoted only when a
 * measurement says so and only for the seat that owns it. Reverting the routing in `index.ts` fails the first two cases.
 */

function harness(options: { rttMs?: number; candidateRttMs?: (seat: number) => number; withSignal?: boolean } = {}) {
  const clock = { now: 0 };
  const relay = new FakeTransport({ kind: 'ws-relay', seat: -1, stats: { rttMs: options.rttMs ?? 95, lossPct: 0 } });
  const candidates = new Map<number, FakeTransport>();
  const notices: TransportNotice[] = [];
  const inbound: Array<{ channel: string; seat: number; bytes: Uint8Array }> = [];
  const bus = new FakeSignalBus();
  const board = createSwitchboard({
    relay,
    localSeat: 0,
    peers: [1, 2],
    now: () => clock.now,
    autoTick: false,
    ...(options.withSignal === false
      ? {}
      : {
          signal: bus.endpoint(0),
          createCandidate: (seat: number) => {
            const candidate = new FakeTransport({
              kind: 'webrtc',
              seat,
              stats: { rttMs: options.candidateRttMs?.(seat) ?? 40 },
            });
            candidates.set(seat, candidate);
            return candidate;
          },
        }),
    announce: (notice) => notices.push(notice),
    onMessage: (channel, seat, bytes) => inbound.push({ channel, seat, bytes }),
  });
  const flush = () => Promise.resolve();
  return { board, relay, candidates, notices, clock, flush, inbound };
}

const input = encodeInputFrame({ seq: 1, tick: 1, axes: [1], buttons: 0 });
const event = encodeEventFrame(1, new Uint8Array([9]));

describe('createSwitchboard', () => {
  it('stays relay-only for a whole epoch when there is no signalling sink', async () => {
    const { board, relay, candidates, notices, clock, flush } = harness({ withSignal: false, rttMs: 200 });
    clock.now = 60_000;
    board.evaluate();
    await flush();
    board.send('input', input, 1);
    board.send('event', event, 1);
    expect(candidates.size).toBe(0);
    expect(notices).toEqual([]);
    expect(relay.sent.map((entry) => entry.channel)).toEqual(['input', 'event']);
    expect(relay.sent[0]!.bytes).toEqual(input);
  });

  it('routes a promoted seat away from the relay while events stay on the relay for every seat', async () => {
    // Seat 1's pair clears the 30 % bar; seat 2's does not, so it stays on the relay.
    const { board, relay, candidates, notices, clock, flush } = harness({
      candidateRttMs: (seat) => (seat === 1 ? 40 : 80),
    });
    board.evaluate();
    clock.now = 5_000;
    board.evaluate();
    await flush();
    clock.now = 6_000;
    board.evaluate();
    expect(notices).toEqual([{ seat: 1, kind: 'webrtc' }]);

    board.send('input', input, 1);
    expect(candidates.get(1)!.sent).toHaveLength(1);
    expect(relay.sent).toHaveLength(0);

    // A seat with no promoted pair, and every event, still go through the room.
    board.send('input', input, 2);
    board.send('event', event, 1);
    board.send('event', event);
    expect(relay.sent.map((entry) => entry.channel)).toEqual(['input', 'event', 'event']);
    expect(candidates.get(2)!.sent).toHaveLength(0);
  });

  it('announces each transition once and names the seat that changed', async () => {
    const { board, notices, clock, flush } = harness({ candidateRttMs: (seat) => (seat === 1 ? 40 : 80) });
    board.evaluate();
    clock.now = 5_000;
    board.evaluate();
    await flush();
    clock.now = 6_000;
    board.evaluate();
    board.setEventsOk(1, false);
    expect(notices).toEqual([
      { seat: 1, kind: 'webrtc' },
      { seat: 1, kind: 'ws-relay' },
    ]);
  });

  it('routes a demoted seat back through the relay on the same tick without losing an event', async () => {
    const { board, relay, candidates, notices, clock, flush } = harness({
      candidateRttMs: (seat) => (seat === 1 ? 40 : 80),
    });
    board.evaluate();
    clock.now = 5_000;
    board.evaluate();
    await flush();
    clock.now = 6_000;
    board.evaluate();
    expect(board.stats().get(1)?.kind).toBe('webrtc');

    candidates.get(1)!.close('data channel closed');
    expect(notices).toEqual([
      { seat: 1, kind: 'webrtc' },
      { seat: 1, kind: 'ws-relay' },
    ]);
    board.send('input', input, 1);
    board.send('event', event, 1);
    expect(relay.sent.map((entry) => entry.channel)).toEqual(['input', 'event']);
    expect(relay.sent[1]!.bytes).toEqual(event);
    expect(board.stats().get(1)?.kind).toBe('ws-relay');
  });

  it('does not start a second attempt in the same epoch after a failed one', async () => {
    const clock = { now: 0 };
    const relay = new FakeTransport({ kind: 'ws-relay', seat: -1, stats: { rttMs: 200 } });
    let created = 0;
    const board = createSwitchboard({
      relay,
      localSeat: 0,
      peers: [1],
      signal: new FakeSignalBus().endpoint(0),
      now: () => clock.now,
      autoTick: false,
      createCandidate: (seat) => {
        created += 1;
        const candidate = new FakeTransport({ kind: 'webrtc', seat });
        candidate.failOpen = true;
        return candidate;
      },
    });
    board.evaluate();
    clock.now = 5_000;
    board.evaluate();
    await Promise.resolve();
    clock.now = 20_000;
    board.evaluate();
    await Promise.resolve();
    expect(created).toBe(1);
  });

  it('gives a failed pair a fresh attempt when a new epoch begins', async () => {
    const clock = { now: 0 };
    const relay = new FakeTransport({ kind: 'ws-relay', seat: -1, stats: { rttMs: 200 } });
    let created = 0;
    const board = createSwitchboard({
      relay,
      localSeat: 0,
      peers: [1],
      signal: new FakeSignalBus().endpoint(0),
      now: () => clock.now,
      autoTick: false,
      createCandidate: (seat) => {
        created += 1;
        const candidate = new FakeTransport({ kind: 'webrtc', seat });
        candidate.failOpen = true;
        return candidate;
      },
    });
    board.evaluate();
    clock.now = 5_000;
    board.evaluate();
    await Promise.resolve();
    expect(created).toBe(1);
    board.beginEpoch();
    board.evaluate();
    clock.now = 11_000;
    board.evaluate();
    await Promise.resolve();
    expect(created).toBe(2);
  });

  it('hands pair traffic to onMessage and leaves relay traffic to the room subscription', async () => {
    const { board, relay, candidates, clock, flush, inbound } = harness();
    board.evaluate();
    clock.now = 5_000;
    board.evaluate();
    await flush();
    clock.now = 6_000;
    board.evaluate();
    relay.deliver('input', 1, input);
    expect(inbound).toEqual([]);
    candidates.get(1)!.deliver('input', 1, input);
    expect(inbound).toEqual([{ channel: 'input', seat: 1, bytes: input }]);
  });

  it('reports one entry per remote seat', () => {
    const { board } = harness();
    expect([...board.stats().keys()]).toEqual([1, 2]);
  });

  it('stops routing once it is closed', () => {
    const { board, relay } = harness();
    board.close('connection closed');
    board.send('input', input, 1);
    expect(relay.sent).toEqual([]);
    expect(relay.closedWith).toBe('connection closed');
  });
});
