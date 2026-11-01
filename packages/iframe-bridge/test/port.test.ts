import { afterEach, describe, expect, it, vi } from 'vitest';

import { attachPort } from '../src/port.js';
import { closePorts, message, ports, validate } from './helpers.js';

const opened: MessagePort[] = [];
afterEach(() => closePorts(...opened.splice(0)));

describe('port transport', () => {
  it('delivers a valid JSON envelope and counts it', async () => {
    const [local, peer] = ports();
    opened.push(local, peer);
    const onMessage = vi.fn();
    const bridge = attachPort(local, { validate, onMessage });

    peer.postMessage(JSON.stringify(message('m1')));

    await vi.waitFor(() => expect(onMessage).toHaveBeenCalledWith(message('m1')));
    expect(bridge.stats()).toMatchObject({ received: 1, dropped: { invalid: 0 } });
  });

  it('drops non-string messages before parsing', async () => {
    const [local, peer] = ports();
    opened.push(local, peer);
    const onMessage = vi.fn();
    const bridge = attachPort(local, { validate, onMessage });

    peer.postMessage({ v: 1 });

    await vi.waitFor(() => expect(bridge.stats().dropped.invalid).toBe(1));
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('drops malformed JSON', async () => {
    const [local, peer] = ports();
    opened.push(local, peer);
    const bridge = attachPort(local, { validate, onMessage: vi.fn() });

    peer.postMessage('{');

    await vi.waitFor(() => expect(bridge.stats().dropped.invalid).toBe(1));
  });

  it('drops envelopes rejected by the validator, including unknown types', async () => {
    const [local, peer] = ports();
    opened.push(local, peer);
    const bridge = attachPort(local, { validate: () => null, onMessage: vi.fn() });

    peer.postMessage(JSON.stringify(message('unknown')));

    await vi.waitFor(() => expect(bridge.stats().dropped.invalid).toBe(1));
  });
});
