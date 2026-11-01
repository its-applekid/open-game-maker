import type { Envelope } from '@ogm/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BridgeError } from '../src/errors.js';
import { attachPort } from '../src/port.js';
import { closePorts, message, ports, validate } from './helpers.js';

const opened: MessagePort[] = [];
afterEach(() => closePorts(...opened.splice(0)));

describe('request correlation', () => {
  it('resolves by replyTo without delivering the reply to onMessage', async () => {
    const [local, peer] = ports();
    opened.push(local, peer);
    const onMessage = vi.fn();
    const bridge = attachPort(local, { validate, onMessage });
    peer.onmessage = ({ data }) => {
      const request = JSON.parse(data as string) as Envelope<string, unknown>;
      peer.postMessage(JSON.stringify({ ...message('reply'), replyTo: request.id, payload: { ok: true } }));
    };

    const reply = await bridge.request<Envelope<string, { ok: boolean }>>(message('request'));

    expect(reply.payload.ok).toBe(true);
    expect(onMessage).not.toHaveBeenCalled();
    expect(bridge.stats()).toMatchObject({ sent: 1, received: 1 });
  });

  it('rejects a request when its timeout elapses', async () => {
    vi.useFakeTimers();
    const [local, peer] = ports();
    opened.push(local, peer);
    const bridge = attachPort(local, { validate, onMessage: vi.fn() });
    const rejection = expect(bridge.request(message('timeout'), 10)).rejects.toEqual(new BridgeError('timeout'));

    await vi.advanceTimersByTimeAsync(10);

    await rejection;
    vi.useRealTimers();
  });

  it('rejects every pending request when closed', async () => {
    const [local, peer] = ports();
    opened.push(local, peer);
    const bridge = attachPort(local, { validate, onMessage: vi.fn() });
    const first = bridge.request(message('first'));
    const second = bridge.request(message('second'));

    bridge.close();

    await expect(first).rejects.toEqual(new BridgeError('closed'));
    await expect(second).rejects.toEqual(new BridgeError('closed'));
  });

  it('does not deliver replies with unknown correlation ids', async () => {
    const [local, peer] = ports();
    opened.push(local, peer);
    const onMessage = vi.fn();
    attachPort(local, { validate, onMessage });

    peer.postMessage(JSON.stringify({ ...message('reply'), replyTo: 'missing' }));

    await vi.waitFor(() => expect(onMessage).toHaveBeenCalledTimes(1));
  });
});
