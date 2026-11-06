import type {
  DataChannelLike,
  IceCandidateLike,
  PeerConnectionLike,
  RtcStatsEntry,
  RtcStatsReportLike,
  SessionDescriptionLike,
  SignalSink,
} from './webrtc';
import type { ChannelName, Transport, TransportHandlers, TransportKind, TransportStats } from './types';

/**
 * Test doubles for the transport seam (N4, #498 §7).
 *
 * No test in this directory reaches for `RTCPeerConnection`, a socket or a timer: a fake peer connection, a fake data
 * channel and an in-process signal bus are enough to drive a full offer/answer, and the switchboard takes `now` so a
 * selection scenario is deterministic.
 */

/** One end of a fake data channel; `send` on either side delivers to the other's `onmessage`. */
export class FakeDataChannel implements DataChannelLike {
  readonly label: string;
  readyState = 'connecting';
  binaryType = 'blob';
  bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  sent: Uint8Array[] = [];
  peer?: FakeDataChannel;

  constructor(label: string) {
    this.label = label;
  }

  send(data: Uint8Array): void {
    this.sent.push(data);
    this.peer?.deliver(data);
  }

  deliver(data: unknown): void {
    this.onmessage?.({ data });
  }

  open(): void {
    this.readyState = 'open';
    this.onopen?.();
  }

  close(): void {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.onclose?.();
  }
}

/** The subset of `RTCPeerConnection` the transport uses, with a scripted offer/answer that connects two fakes. */
export class FakePeerConnection implements PeerConnectionLike {
  connectionState = 'new';
  iceConnectionState = 'new';
  localDescription: SessionDescriptionLike | null = null;
  remoteDescription: SessionDescriptionLike | null = null;
  onicecandidate: ((event: { candidate: IceCandidateLike | null }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((event: { channel: DataChannelLike }) => void) | null = null;
  readonly channels: FakeDataChannel[] = [];
  readonly channelInit: Array<{ ordered: boolean; maxRetransmits: number }> = [];
  readonly config: unknown;
  statsEntries: RtcStatsEntry[] = [];
  link?: FakePeerConnection;

  constructor(config: unknown) {
    this.config = config;
  }

  createDataChannel(label: string, init: { ordered: boolean; maxRetransmits: number }): DataChannelLike {
    const channel = new FakeDataChannel(label);
    this.channels.push(channel);
    this.channelInit.push(init);
    return channel;
  }

  createOffer(): Promise<SessionDescriptionLike> {
    return Promise.resolve({ type: 'offer', sdp: 'v=0 fake offer' });
  }

  createAnswer(): Promise<SessionDescriptionLike> {
    return Promise.resolve({ type: 'answer', sdp: 'v=0 fake answer' });
  }

  setLocalDescription(description: SessionDescriptionLike): Promise<void> {
    this.localDescription = description;
    return Promise.resolve();
  }

  setRemoteDescription(description: SessionDescriptionLike): Promise<void> {
    this.remoteDescription = description;
    if (description.type !== 'answer') return Promise.resolve();
    // The offerer has the answer, so this pair is connected: open the mirrored channel on the answerer and go live.
    const link = this.link;
    const local = this.channels[0];
    if (link !== undefined && local !== undefined) {
      const inbound = new FakeDataChannel(local.label);
      local.peer = inbound;
      inbound.peer = local;
      link.ondatachannel?.({ channel: inbound });
      local.open();
      inbound.open();
      link.connectionState = 'connected';
      link.onconnectionstatechange?.();
    }
    this.connectionState = 'connected';
    this.onconnectionstatechange?.();
    return Promise.resolve();
  }

  addIceCandidate(): Promise<void> {
    return Promise.resolve();
  }

  getStats(): Promise<RtcStatsReportLike> {
    return Promise.resolve({
      forEach: (callback: (entry: RtcStatsEntry) => void) => {
        for (const entry of this.statsEntries) callback(entry);
      },
    });
  }

  close(): void {
    this.connectionState = 'closed';
    this.onconnectionstatechange?.();
  }

  /** Drive an ICE failure, which is what a blocked NAT looks like to the transport. */
  failIce(): void {
    this.iceConnectionState = 'failed';
    this.oniceconnectionstatechange?.();
  }
}

/** Two fake peers already linked, so an offer/answer crosses only through the injected signal sink. */
export function linkedPeerConnections(config: unknown = {}): [FakePeerConnection, FakePeerConnection] {
  const offerer = new FakePeerConnection(config);
  const answerer = new FakePeerConnection(config);
  offerer.link = answerer;
  answerer.link = offerer;
  return [offerer, answerer];
}

type SignalListener = (from: number, data: string) => void;

/** One in-process signal bus; N3's `net.signal` is the production path with the same shape. */
export class FakeSignalBus {
  readonly delivered: Array<{ from: number; to: number; data: string }> = [];
  private readonly listeners = new Set<SignalListener>();

  endpoint(from: number): SignalSink {
    return {
      send: (to, data) => {
        this.delivered.push({ from, to, data });
        for (const listener of [...this.listeners]) listener(from, data);
      },
      onSignal: (listener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      },
    };
  }
}

export function stats(overrides: Partial<TransportStats> = {}): TransportStats {
  return {
    kind: 'ws-relay',
    rttMs: 0,
    jitterMs: 0,
    lossPct: 0,
    bytesOut: 0,
    bytesIn: 0,
    drops: 0,
    connectedMs: 0,
    ...overrides,
  };
}

/** A transport the switchboard can drive without a socket; `open()` resolves or rejects on demand. */
export class FakeTransport implements Transport {
  readonly kind: TransportKind;
  readonly seat: number;
  readonly sent: Array<{ channel: ChannelName; bytes: Uint8Array }> = [];
  currentStats: TransportStats;
  closedWith?: string;
  handlers?: TransportHandlers;
  failOpen = false;

  constructor(options: { kind: TransportKind; seat: number; stats?: Partial<TransportStats> }) {
    this.kind = options.kind;
    this.seat = options.seat;
    this.currentStats = stats({ kind: options.kind, ...options.stats });
  }

  open(handlers: TransportHandlers): Promise<void> {
    this.handlers = handlers;
    return this.failOpen ? Promise.reject(new Error('open failed')) : Promise.resolve();
  }

  send(channel: ChannelName, bytes: Uint8Array): void {
    this.sent.push({ channel, bytes });
  }

  stats(): TransportStats {
    return this.currentStats;
  }

  close(reason: string): void {
    if (this.closedWith !== undefined) return;
    this.closedWith = reason;
    this.handlers?.closed(reason);
  }

  setStats(overrides: Partial<TransportStats>): void {
    this.currentStats = { ...this.currentStats, ...overrides };
  }

  deliver(channel: ChannelName, seat: number, bytes: Uint8Array): void {
    this.handlers?.message(channel, seat, bytes);
  }
}
