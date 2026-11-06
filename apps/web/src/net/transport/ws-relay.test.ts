import type { ClientMessage, ServerMessage } from '@ogm/contracts/browser';
import { describe, expect, it } from 'vitest';

import { decodeEventFrame, decodeStateFrame, encodeEventFrame, encodeInputFrame, encodeStateFrame } from './frames';
import { ALL_SEATS, type TransportHandlers } from './types';
import { WsRelayTransport } from './ws-relay';

/**
 * The relay adapter (#498 §7.3): the channel ↔ room-message mapping, the size caps the transport owns a second copy
 * of, and the timing observations the selector reads. Reverting the mapping or the caps fails the first three cases.
 */

function harness(now = () => 0) {
  const sent: ClientMessage[] = [];
  const listeners = new Set<(message: ServerMessage) => void>();
  const client = {
    send: (message: ClientMessage) => sent.push(message),
    subscribe: (listener: (message: ServerMessage) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const inbound: Array<{ channel: string; seat: number; bytes: Uint8Array }> = [];
  const handlers: TransportHandlers = {
    message: (channel, seat, bytes) => inbound.push({ channel, seat, bytes }),
    stats: () => {},
    closed: () => {},
  };
  const transport = new WsRelayTransport({ client, now });
  const emit = (message: ServerMessage) => listeners.forEach((listener) => listener(message));
  return { transport, handlers, sent, inbound, emit };
}

describe('WsRelayTransport', () => {
  it('sends an input frame as exactly one room input message', async () => {
    const { transport, handlers, sent } = harness();
    await transport.open(handlers);
    transport.send('input', encodeInputFrame({ seq: 7, tick: 120, axes: [0.5, -1], buttons: 3 }));
    expect(sent).toEqual([{ t: 'input', f: { seq: 7, tick: 120, axes: [0.5, -1], buttons: 3 } }]);
    expect(transport.stats().bytesOut).toBeGreaterThan(0);
  });

  it('sends a state frame as a room snapshot and an event frame as a room event', async () => {
    const { transport, handlers, sent } = harness();
    await transport.open(handlers);
    transport.send('state', encodeStateFrame(12, 340, new Uint8Array([1, 2, 3])));
    transport.send('event', encodeEventFrame(4, new Uint8Array([9])));
    expect(sent[0]).toEqual({ t: 'snapshot', seq: 12, tick: 340, data: new Uint8Array([1, 2, 3]) });
    expect(sent[1]).toEqual({ t: 'event', seq: 4, data: new Uint8Array([9]) });
  });

  it('refuses an oversized payload and counts the drop instead of sending it', async () => {
    const { transport, handlers, sent } = harness();
    await transport.open(handlers);
    const oversized = new Uint8Array(65_537);
    transport.send('state', encodeStateFrame(1, 1, oversized));
    expect(sent).toEqual([]);
    expect(transport.stats().drops).toBe(1);
  });

  it('refuses a malformed frame instead of sending a guess', async () => {
    const { transport, handlers, sent } = harness();
    await transport.open(handlers);
    transport.send('input', new Uint8Array([0x01, 0x7b]));
    expect(sent).toEqual([]);
    expect(transport.stats().drops).toBe(1);
  });

  it('learns the round trip from a pong and keeps the minimum', async () => {
    let clock = 1_000;
    const { transport, handlers, emit } = harness(() => clock);
    await transport.open(handlers);
    emit({ t: 'pong', c: 900, s: 0 });
    expect(transport.stats().rttMs).toBe(100);
    clock = 1_100;
    emit({ t: 'pong', c: 1_030, s: 0 });
    expect(transport.stats().rttMs).toBe(70);
  });

  it('measures loss from gaps in the snapshot sequence', async () => {
    let clock = 0;
    const { transport, handlers, emit } = harness(() => clock);
    await transport.open(handlers);
    for (const seq of [1, 2, 4, 5]) {
      clock += 10;
      emit({ t: 'snapshot', seq, tick: seq, data: new Uint8Array(2) });
    }
    // Four frames arrived out of the five the sequence implied, so a fifth of the window was lost.
    expect(transport.stats().lossPct).toBe(20);
  });

  it('forwards inbound room traffic as framed channel bytes', async () => {
    const { transport, handlers, inbound, emit } = harness(() => 0);
    await transport.open(handlers);
    emit({ t: 'snapshot', seq: 3, tick: 9, data: new Uint8Array([4]) });
    emit({ t: 'event', seq: 2, data: new Uint8Array([5]) });
    emit({
      t: 'input',
      f: { seq: 1, tick: 1, axes: [], buttons: 0, playerIndex: 2, from: 'user-1' },
    });
    expect(inbound[0]).toMatchObject({ channel: 'state', seat: ALL_SEATS });
    expect(decodeStateFrame(inbound[0]!.bytes)).toEqual({ seq: 3, tick: 9, data: new Uint8Array([4]) });
    expect(decodeEventFrame(inbound[1]!.bytes)).toEqual({ seq: 2, data: new Uint8Array([5]) });
    expect(inbound[2]).toMatchObject({ channel: 'input', seat: 2 });
  });

  it('reports how long it has been open', async () => {
    let clock = 500;
    const { transport, handlers } = harness(() => clock);
    await transport.open(handlers);
    clock = 2_500;
    expect(transport.stats().connectedMs).toBe(2_000);
  });
});
