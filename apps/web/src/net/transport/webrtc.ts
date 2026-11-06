import { FRAME_EVENT, FRAME_INPUT, FRAME_STATE, decodeInputFrame, decodeStateFrame } from './frames';
import { JitterEstimator, LossEstimator, RttEstimator } from './stats';
import {
  TRANSPORT_LIMITS,
  type ChannelName,
  type Transport,
  type TransportHandlers,
  type TransportStats,
} from './types';

/**
 * One promoted pair on native `RTCPeerConnection` (N4, #498 §4.2, §4.5).
 *
 * One data channel carries `input` and `state`, both latest-wins, with a leading tag byte so a reader can route the
 * frame and drop an old state. Events never come here: the relay keeps them, which is one authority for rules-relevant
 * messages and no dual-receive dedupe. Signalling is opaque and rides N3's `net.signal` through the injected sink.
 */

export const PEER_CHANNEL = 'ogm-input';

/** A hard ceiling on an inbound signalling payload; N3's own `net.signal` cap is 4 KiB. */
export const MAX_SIGNAL_CHARS = 16_384;

export type SignalSink = {
  /** Send one opaque signalling payload to `to` (N3's `net.signal { epoch, to, data }`). */
  send(to: number, data: string): void;
  /** Receive every seat's signalling payload; a transport ignores the ones not addressed to its pair. */
  onSignal(listener: (from: number, data: string) => void): () => void;
};

export type DataChannelLike = {
  readonly label: string;
  readonly readyState: string;
  readonly bufferedAmount: number;
  binaryType: string;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  send(data: Uint8Array): void;
  close(): void;
};

export type IceCandidateLike = {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

export type SessionDescriptionLike = { type: string; sdp: string };

export type RtcStatsEntry = { type: string; [key: string]: unknown };
export type RtcStatsReportLike = { forEach(callback: (entry: RtcStatsEntry) => void): void };

export type PeerConnectionLike = {
  connectionState: string;
  iceConnectionState: string;
  localDescription: SessionDescriptionLike | null;
  onicecandidate: ((event: { candidate: IceCandidateLike | null }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  oniceconnectionstatechange: (() => void) | null;
  ondatachannel: ((event: { channel: DataChannelLike }) => void) | null;
  createDataChannel(label: string, init: { ordered: boolean; maxRetransmits: number }): DataChannelLike;
  createOffer(): Promise<SessionDescriptionLike>;
  createAnswer(): Promise<SessionDescriptionLike>;
  setLocalDescription(description: SessionDescriptionLike): Promise<void>;
  setRemoteDescription(description: SessionDescriptionLike): Promise<void>;
  addIceCandidate(candidate: IceCandidateLike): Promise<void>;
  getStats(): Promise<RtcStatsReportLike>;
  close(): void;
};

export type PeerConnectionFactory = (config: { iceServers: Array<{ urls: string }> }) => PeerConnectionLike;

export type WebRtcTransportOptions = {
  seat: number;
  /** The lower seat id offers, so there is no glare to resolve. */
  role: 'offerer' | 'answerer';
  signal: SignalSink;
  iceUrls?: readonly string[];
  now?: () => number;
  attemptTimeoutMs?: number;
  /** 0 disables the interval; tests call `pollStats()` themselves. */
  pollEveryMs?: number;
  peerConnectionFactory?: PeerConnectionFactory;
};

type SignalPayload = { sdp?: SessionDescriptionLike; candidate?: IceCandidateLike };

/** Native WebRTC in a browser; absent in Node and in jsdom, which is why every caller feature-detects. */
export function webRtcAvailable(): boolean {
  return typeof (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection === 'function';
}

function nativePeerConnection(config: { iceServers: Array<{ urls: string }> }): PeerConnectionLike {
  const Ctor = (globalThis as { RTCPeerConnection?: new (config: unknown) => PeerConnectionLike }).RTCPeerConnection;
  if (Ctor === undefined) throw new Error('RTCPeerConnection is unavailable');
  return new Ctor(config);
}

export class WebRtcTransport implements Transport {
  readonly kind = 'webrtc' as const;
  readonly seat: number;

  private readonly options: WebRtcTransportOptions;
  private readonly now: () => number;
  private readonly rtt = new RttEstimator(10);
  private readonly jitter = new JitterEstimator();
  private readonly loss = new LossEstimator(TRANSPORT_LIMITS.demoteWindowMs);
  private handlers?: TransportHandlers;
  private peer?: PeerConnectionLike;
  private channel?: DataChannelLike;
  private stopSignals?: () => void;
  private pollTimer?: ReturnType<typeof setInterval>;
  private openedAt?: number;
  private negotiatedAt?: number;
  private bytesOut = 0;
  private bytesIn = 0;
  private drops = 0;
  private warnedEvent = false;
  private closed = false;
  private closedReason = '';

  constructor(options: WebRtcTransportOptions) {
    this.options = options;
    this.seat = options.seat;
    this.now = options.now ?? Date.now;
  }

  async open(handlers: TransportHandlers): Promise<void> {
    this.handlers = handlers;
    const factory = this.options.peerConnectionFactory ?? (webRtcAvailable() ? nativePeerConnection : undefined);
    if (factory === undefined) throw new Error('WebRTC is unavailable on this client');
    const iceServers = (this.options.iceUrls ?? []).map((urls) => ({ urls }));
    const peer = factory({ iceServers });
    this.peer = peer;
    this.openedAt = this.now();

    peer.onicecandidate = (event) => {
      if (event.candidate != null) this.signal({ candidate: event.candidate });
    };
    peer.ondatachannel = (event) => this.attachChannel(event.channel);
    if (this.options.role === 'offerer') this.attachChannel(this.createChannel(peer));

    const timeoutMs = this.options.attemptTimeoutMs ?? TRANSPORT_LIMITS.attemptTimeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settled = new Promise<void>((resolve, reject) => {
      let done = false;
      const finish = (error?: string) => {
        if (done) return;
        done = true;
        if (timer !== undefined) clearTimeout(timer);
        if (error === undefined) resolve();
        else reject(new Error(error));
      };
      timer = setTimeout(() => finish('webrtc attempt timed out'), timeoutMs);
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') finish();
        else if (peer.connectionState === 'failed' || peer.connectionState === 'closed')
          finish(`webrtc connection ${peer.connectionState}`);
      };
      peer.oniceconnectionstatechange = () => {
        if (peer.iceConnectionState === 'failed') finish('webrtc ice failed');
      };
      this.stopSignals = this.options.signal.onSignal((from, data) => {
        if (from === this.seat) void this.acceptSignal(data);
      });
      if (peer.connectionState === 'connected') finish();
    });
    // A rejection that lands while the offer is still in flight must not surface as an unhandled rejection; the catch
    // below awaits this same promise.
    settled.catch(() => {});

    try {
      if (this.options.role === 'offerer') await this.offer(peer);
      await settled;
    } catch (error) {
      this.close(error instanceof Error ? error.message : 'webrtc attempt failed');
      throw error;
    }
    this.negotiatedAt = this.now();
    const pollEveryMs = this.options.pollEveryMs ?? TRANSPORT_LIMITS.statsEveryMs;
    if (pollEveryMs > 0) this.pollTimer = setInterval(() => void this.pollStats(), pollEveryMs);
    this.handlers?.stats(this.stats());
  }

  send(channel: ChannelName, bytes: Uint8Array): void {
    if (channel === 'event') {
      // §4.2 and §1.4: events stay on the relay, so this is a routing bug rather than a slow path.
      this.drops += 1;
      if (!this.warnedEvent) {
        this.warnedEvent = true;
        console.warn('Refused to send an event on a WebRTC pair; events stay on the relay');
      }
      return;
    }
    if (this.channel === undefined || this.channel.readyState !== 'open') {
      this.drops += 1;
      return;
    }
    this.bytesOut += bytes.byteLength;
    this.channel.send(bytes);
  }

  stats(): TransportStats {
    const since = this.negotiatedAt ?? this.openedAt;
    return {
      kind: this.kind,
      rttMs: this.rtt.ms,
      jitterMs: this.jitter.ms,
      lossPct: this.loss.pct,
      bytesOut: this.bytesOut,
      bytesIn: this.bytesIn,
      drops: this.drops,
      connectedMs: since === undefined ? 0 : this.now() - since,
    };
  }

  close(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.closedReason = reason;
    if (this.pollTimer !== undefined) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    this.stopSignals?.();
    this.stopSignals = undefined;
    try {
      this.channel?.close();
    } catch {
      // Closing a channel that never opened is not an error worth propagating.
    }
    this.peer?.close();
    this.handlers?.closed(reason);
  }

  /** Read the pair's counters; the interval calls this, and so does a test. */
  async pollStats(): Promise<void> {
    const peer = this.peer;
    if (peer === undefined || this.closed) return;
    let report: RtcStatsReportLike;
    try {
      report = await peer.getStats();
    } catch {
      return;
    }
    report.forEach((entry) => {
      if (entry.type !== 'candidate-pair') return;
      const nominated = entry.nominated === true || entry.state === 'succeeded' || entry.selected === true;
      const seconds = entry.currentRoundTripTime;
      if (!nominated || typeof seconds !== 'number') return;
      const sample = seconds * 1_000;
      this.rtt.add(sample);
      this.jitter.add(sample);
    });
    this.handlers?.stats(this.stats());
  }

  private createChannel(peer: PeerConnectionLike): DataChannelLike {
    return peer.createDataChannel(PEER_CHANNEL, { ordered: false, maxRetransmits: 0 });
  }

  private attachChannel(channel: DataChannelLike): void {
    channel.binaryType = 'arraybuffer';
    this.channel = channel;
    channel.onopen = () => this.handlers?.stats(this.stats());
    channel.onclose = () => {
      if (this.closed) return;
      this.handlers?.closed('data channel closed');
    };
    channel.onerror = () => {
      if (this.closed) return;
      this.handlers?.closed('data channel error');
    };
    channel.onmessage = (event) => this.receive(event.data);
  }

  private receive(data: unknown): void {
    const bytes = toBytes(data);
    if (bytes === undefined || bytes.byteLength === 0) return;
    this.bytesIn += bytes.byteLength;
    const tag = bytes[0];
    if (tag === FRAME_STATE) {
      const frame = decodeStateFrame(bytes);
      if (frame === undefined) return;
      this.loss.observe(frame.seq, this.now());
      this.handlers?.message('state', this.seat, bytes);
      return;
    }
    if (tag === FRAME_INPUT) {
      if (decodeInputFrame(bytes) === undefined) return;
      this.handlers?.message('input', this.seat, bytes);
      return;
    }
    if (tag === FRAME_EVENT) {
      // A peer that puts an event on the pair would give the same event two authorities; the relay keeps that channel.
      this.drops += 1;
      if (!this.warnedEvent) {
        this.warnedEvent = true;
        console.warn('Dropped an event frame received on a WebRTC pair; events stay on the relay');
      }
    }
  }

  private async offer(peer: PeerConnectionLike): Promise<void> {
    await peer.setLocalDescription(await peer.createOffer());
    const local = peer.localDescription;
    if (local !== null) this.signal({ sdp: local });
  }

  private async acceptSignal(data: string): Promise<void> {
    const peer = this.peer;
    if (peer === undefined || this.closed) return;
    // N3 caps `net.signal` at 4 KiB; refuse anything wildly past it before parsing, so a hostile peer cannot make this
    // client allocate an SDP it never intended to accept.
    if (data.length > MAX_SIGNAL_CHARS) return;
    const payload = parseSignal(data);
    if (payload === undefined) return;
    if (payload.candidate !== undefined) {
      try {
        await peer.addIceCandidate(payload.candidate);
      } catch {
        // A candidate the browser refuses is normal during negotiation; the pair fails only if none succeed.
      }
      return;
    }
    if (payload.sdp === undefined) return;
    if (payload.sdp.type === 'offer' && this.options.role === 'answerer') {
      await peer.setRemoteDescription(payload.sdp);
      await peer.setLocalDescription(await peer.createAnswer());
      const local = peer.localDescription;
      if (local !== null) this.signal({ sdp: local });
      return;
    }
    if (payload.sdp.type === 'answer' && this.options.role === 'offerer') await peer.setRemoteDescription(payload.sdp);
  }

  private signal(payload: SignalPayload): void {
    if (this.closed) return;
    this.options.signal.send(this.seat, JSON.stringify(payload));
  }

  /** Read-only view for diagnostics; `closed` is why a demotion happened. */
  get closedWith(): string {
    return this.closedReason;
  }
}

function parseSignal(data: string): SignalPayload | undefined {
  try {
    const parsed: unknown = JSON.parse(data);
    if (parsed === null || typeof parsed !== 'object') return undefined;
    const payload = parsed as SignalPayload;
    if (payload.sdp !== undefined && typeof payload.sdp.sdp === 'string' && typeof payload.sdp.type === 'string') {
      return { sdp: payload.sdp };
    }
    if (payload.candidate !== undefined && typeof payload.candidate === 'object') {
      return { candidate: payload.candidate };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function toBytes(data: unknown): Uint8Array | undefined {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === 'string') return new TextEncoder().encode(data);
  return undefined;
}
