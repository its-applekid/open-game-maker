import { afterEach, describe, expect, it, vi } from 'vitest';

import { encodeEventFrame, encodeInputFrame, encodeStateFrame } from './frames';
import { FakePeerConnection, FakeSignalBus } from './test-support';
import type { TransportHandlers } from './types';
import { PEER_CHANNEL, WebRtcTransport, webRtcAvailable } from './webrtc';

/**
 * One pair, driven by a fake peer connection and an in-process signal bus (#498 §7.4). No browser, no socket and no
 * real ICE: a test that reached for `RTCPeerConnection` would be a CI flake source with no networking at all.
 */

function handlers() {
  const messages: Array<{ channel: string; seat: number; bytes: Uint8Array }> = [];
  const closed: string[] = [];
  const transportHandlers: TransportHandlers = {
    message: (channel, seat, bytes) => messages.push({ channel, seat, bytes }),
    stats: () => {},
    closed: (reason) => closed.push(reason),
  };
  return { transportHandlers, messages, closed };
}

/** The offerer on seat 0 and the answerer on seat 1, each with its own fake peer connection, linked through the bus. */
async function connectedPair() {
  const bus = new FakeSignalBus();
  const [offererPeer, answererPeer] = linkedPeers();
  const offerer = new WebRtcTransport({
    seat: 1,
    role: 'offerer',
    signal: bus.endpoint(0),
    peerConnectionFactory: () => offererPeer,
    pollEveryMs: 0,
    attemptTimeoutMs: 50,
  });
  const answerer = new WebRtcTransport({
    seat: 0,
    role: 'answerer',
    signal: bus.endpoint(1),
    peerConnectionFactory: () => answererPeer,
    pollEveryMs: 0,
    attemptTimeoutMs: 50,
  });
  const a = handlers();
  const b = handlers();
  const answererOpen = answerer.open(b.transportHandlers);
  await offerer.open(a.transportHandlers);
  await answererOpen;
  return { offerer, answerer, offererPeer, answererPeer, bus, offererHandlers: a, answererHandlers: b };
}

function linkedPeers(): [FakePeerConnection, FakePeerConnection] {
  const offerer = new FakePeerConnection({});
  const answerer = new FakePeerConnection({});
  offerer.link = answerer;
  answerer.link = offerer;
  return [offerer, answerer];
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('webRtcAvailable', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'RTCPeerConnection');
  });

  it('is false without a native RTCPeerConnection', () => {
    Reflect.deleteProperty(globalThis, 'RTCPeerConnection');
    expect(webRtcAvailable()).toBe(false);
  });

  it('is true once the browser provides one', () => {
    Object.defineProperty(globalThis, 'RTCPeerConnection', { value: class {}, configurable: true });
    expect(webRtcAvailable()).toBe(true);
  });
});

describe('WebRtcTransport', () => {
  it('refuses to open when WebRTC is unavailable and no fake is injected', async () => {
    Reflect.deleteProperty(globalThis, 'RTCPeerConnection');
    const transport = new WebRtcTransport({ seat: 1, role: 'offerer', signal: new FakeSignalBus().endpoint(0) });
    await expect(transport.open(handlers().transportHandlers)).rejects.toThrow('unavailable');
  });

  it('opens exactly one unordered, unreliable channel named ogm-input and no event channel', async () => {
    const { offererPeer } = await connectedPair();
    expect(offererPeer.channels.map((channel) => channel.label)).toEqual([PEER_CHANNEL]);
    expect(offererPeer.channelInit[0]).toEqual({ ordered: false, maxRetransmits: 0 });
  });

  it('carries input and state on the pair and passes them to the handlers', async () => {
    const { offerer, answerer, offererHandlers, answererHandlers } = await connectedPair();
    const input = encodeInputFrame({ seq: 1, tick: 2, axes: [1], buttons: 0 });
    const state = encodeStateFrame(3, 4, new Uint8Array([7, 8]));
    offerer.send('input', input);
    offerer.send('state', state);
    expect(answererHandlers.messages.map((message) => message.channel)).toEqual(['input', 'state']);
    // The answerer's transport is keyed by the remote seat it talks to, which is the sender's seat.
    expect(answererHandlers.messages[0]).toMatchObject({ seat: 0 });
    expect(answererHandlers.messages[0]!.bytes).toEqual(input);
    // The other direction works the same way, which is what a mesh needs. A pair only ever talks to one seat, so an
    // inbound frame's sending seat is the transport's own `seat`.
    answerer.send('state', state);
    expect(offererHandlers.messages.at(-1)).toMatchObject({ channel: 'state', seat: 1 });
    expect(offerer.stats().bytesOut).toBeGreaterThan(0);
    expect(offerer.stats().bytesIn).toBeGreaterThan(0);
  });

  it('refuses an event on the pair and counts the drop', async () => {
    const { offerer, answererHandlers } = await connectedPair();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    offerer.send('event', new Uint8Array([3, 1, 2]));
    offerer.send('event', new Uint8Array([3, 1, 3]));
    expect(answererHandlers.messages).toEqual([]);
    expect(offerer.stats().drops).toBe(2);
    // One warning per transport, not one per message.
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('rejects when ICE fails before the pair connects, and closes what it opened', async () => {
    const peer = new FakePeerConnection({});
    const transport = new WebRtcTransport({
      seat: 1,
      role: 'offerer',
      signal: new FakeSignalBus().endpoint(0),
      peerConnectionFactory: () => peer,
      pollEveryMs: 0,
      attemptTimeoutMs: 5_000,
    });
    const { transportHandlers, closed } = handlers();
    const opened = transport.open(transportHandlers);
    peer.failIce();
    await expect(opened).rejects.toThrow('ice failed');
    expect(closed).toContain('webrtc ice failed');
    expect(peer.connectionState).toBe('closed');
  });

  it('rejects when the attempt times out instead of holding the slot for ever', async () => {
    vi.useFakeTimers();
    const peer = new FakePeerConnection({});
    const transport = new WebRtcTransport({
      seat: 1,
      role: 'offerer',
      signal: new FakeSignalBus().endpoint(0),
      peerConnectionFactory: () => peer,
      pollEveryMs: 0,
      attemptTimeoutMs: 100,
    });
    const opened = transport.open(handlers().transportHandlers);
    opened.catch(() => {});
    await vi.advanceTimersByTimeAsync(100);
    await expect(opened).rejects.toThrow('timed out');
  });

  it('reads the round trip from the nominated candidate pair', async () => {
    const { offerer, offererPeer } = await connectedPair();
    expect(offerer.stats().rttMs).toBe(0);
    offererPeer.statsEntries = [
      { type: 'candidate-pair', nominated: true, currentRoundTripTime: 0.03 },
      { type: 'candidate-pair', nominated: false, currentRoundTripTime: 1 },
    ];
    await offerer.pollStats();
    expect(offerer.stats().rttMs).toBeCloseTo(30, 5);
  });

  it('drops an event frame a peer puts on the pair instead of giving it a second authority', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bus = new FakeSignalBus();
    const [a, b] = linkedPeers();
    const own = new WebRtcTransport({
      seat: 1,
      role: 'offerer',
      signal: bus.endpoint(0),
      peerConnectionFactory: () => a,
      pollEveryMs: 0,
    });
    const remote = new WebRtcTransport({
      seat: 0,
      role: 'answerer',
      signal: bus.endpoint(1),
      peerConnectionFactory: () => b,
      pollEveryMs: 0,
    });
    const ownHandlers = handlers();
    const remoteOpen = remote.open(handlers().transportHandlers);
    await own.open(ownHandlers.transportHandlers);
    await remoteOpen;
    // The pair's own channel receives the frame, so the transport that owns it is the one that must refuse it.
    a.channels[0]!.deliver(encodeEventFrame(1, new Uint8Array([9])));
    expect(ownHandlers.messages).toEqual([]);
    expect(own.stats().drops).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('tells its handlers when the data channel closes under a live pair', async () => {
    const bus = new FakeSignalBus();
    const [offererPeer, answererPeer] = linkedPeers();
    const own = new WebRtcTransport({
      seat: 1,
      role: 'offerer',
      signal: bus.endpoint(0),
      peerConnectionFactory: () => offererPeer,
      pollEveryMs: 0,
    });
    const remote = new WebRtcTransport({
      seat: 0,
      role: 'answerer',
      signal: bus.endpoint(1),
      peerConnectionFactory: () => answererPeer,
      pollEveryMs: 0,
    });
    const ownHandlers = handlers();
    const remoteOpen = remote.open(handlers().transportHandlers);
    await own.open(ownHandlers.transportHandlers);
    await remoteOpen;
    offererPeer.channels[0]!.close();
    expect(ownHandlers.closed).toContain('data channel closed');
  });
});
