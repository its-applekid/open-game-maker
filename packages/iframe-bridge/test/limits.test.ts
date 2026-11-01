import { BRIDGE_MAX_BYTES, BRIDGE_MAX_MSGS_PER_S } from '@ogm/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeError } from '../src/errors.js';
import { TokenBucket } from '../src/limits.js';
import { attachPort } from '../src/port.js';
import { closePorts, message, nextData, ports, validate } from './helpers.js';

const opened: MessagePort[] = [];
afterEach(() => closePorts(...opened.splice(0)));

describe('bridge limits', () => {
  it('accepts exactly the maximum JSON length and drops one character more', async () => {
    const [local, peer] = ports();
    opened.push(local, peer);
    const onMessage = vi.fn();
    const bridge = attachPort(local, { validate, onMessage });
    const base = JSON.stringify({ ...message('cap'), payload: '' });
    const atCap = JSON.stringify({ ...message('cap'), payload: 'x'.repeat(BRIDGE_MAX_BYTES - base.length) });

    expect(atCap).toHaveLength(BRIDGE_MAX_BYTES);
    peer.postMessage(atCap);
    peer.postMessage(`${atCap}x`);

    await vi.waitFor(() => expect(bridge.stats().dropped.tooLarge).toBe(1));
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it('accepts 120 messages, drops the 121st, then refills after one second', async () => {
    const [local, peer] = ports();
    opened.push(local, peer);
    let now = 0;
    const onMessage = vi.fn();
    const bridge = attachPort(local, { validate, onMessage, now: () => now });

    for (let i = 0; i <= BRIDGE_MAX_MSGS_PER_S; i += 1) peer.postMessage(JSON.stringify(message(`m${i}`)));
    await vi.waitFor(() => expect(bridge.stats().dropped.rateLimited).toBe(1));
    expect(onMessage).toHaveBeenCalledTimes(BRIDGE_MAX_MSGS_PER_S);

    now += 1000;
    peer.postMessage(JSON.stringify(message('refilled')));
    await vi.waitFor(() => expect(onMessage).toHaveBeenCalledTimes(BRIDGE_MAX_MSGS_PER_S + 1));
  });

  it('throws before posting an oversized outbound envelope', () => {
    const [local, peer] = ports();
    opened.push(local, peer);
    const bridge = attachPort(local, { validate, onMessage: vi.fn() });

    expect(() => bridge.send({ ...message('large'), payload: 'x'.repeat(BRIDGE_MAX_BYTES) })).toThrowError(
      new BridgeError('too_large'),
    );
    expect(bridge.stats().sent).toBe(0);
  });

  it('emits no more than one drop error per second', async () => {
    const [local, peer] = ports();
    opened.push(local, peer);
    let now = 0;
    const bridge = attachPort(local, { validate: () => null, onMessage: vi.fn(), now: () => now });

    peer.postMessage('{}');
    peer.postMessage('{}');
    const first = nextData(peer);
    await vi.waitFor(() => expect(bridge.stats().dropped.invalid).toBe(2));
    expect(JSON.parse((await first) as string)).toMatchObject({ t: 'error', payload: { code: 'dropped' } });
    expect(bridge.stats().sent).toBe(1);

    now += 1000;
    const second = nextData(peer);
    peer.postMessage('{}');
    expect(JSON.parse((await second) as string)).toMatchObject({ t: 'error' });
    expect(bridge.stats().sent).toBe(2);
  });

  it('refills token buckets fractionally without exceeding capacity', () => {
    const bucket = new TokenBucket(2, 2);
    expect([bucket.take(0), bucket.take(0), bucket.take(0)]).toEqual([true, true, false]);
    expect(bucket.take(250)).toBe(false);
    expect(bucket.take(500)).toBe(true);
    expect(bucket.take(10_000)).toBe(true);
    expect(bucket.take(10_000)).toBe(true);
    expect(bucket.take(10_000)).toBe(false);
  });
});
