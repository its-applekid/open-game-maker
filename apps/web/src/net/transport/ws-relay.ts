import { LIMITS, type ClientMessage, type ServerMessage } from '@ogm/contracts/browser';

import {
  decodeEventFrame,
  decodeInputFrame,
  decodeStateFrame,
  encodeEventFrame,
  encodeInputFrame,
  encodeStateFrame,
} from './frames';
import { JitterEstimator, LossEstimator, RttEstimator } from './stats';
import { ALL_SEATS, type ChannelName, type Transport, type TransportHandlers, type TransportStats } from './types';

/**
 * Today's path, behind the seam (N4, #498 §2.1).
 *
 * The socket still lives in the host app and the bridge still reads the room client directly; this adapter maps the
 * three channels onto the room's `input`/`snapshot`/`event` messages and owns the timing observations the selector
 * needs, because those only ever come from room traffic (`pong`, snapshot `seq`, input `seq`).
 */

export type RelayClient = {
  send(message: ClientMessage): void;
  subscribe(listener: (message: ServerMessage) => void): () => void;
};

export type WsRelayTransportOptions = {
  client: RelayClient;
  now?: () => number;
};

const textEncoder = new TextEncoder();

export class WsRelayTransport implements Transport {
  readonly kind = 'ws-relay' as const;
  readonly seat = ALL_SEATS;

  private readonly client: RelayClient;
  private readonly now: () => number;
  private readonly rtt = new RttEstimator(10);
  private readonly jitter = new JitterEstimator();
  private readonly snapshotLoss = new LossEstimator(5_000);
  private readonly inputLoss = new LossEstimator(5_000);
  private readonly warned = new Set<ChannelName>();
  private handlers?: TransportHandlers;
  private unsubscribe?: () => void;
  private openedAt?: number;
  private bytesOut = 0;
  private bytesIn = 0;
  private drops = 0;

  constructor(options: WsRelayTransportOptions) {
    this.client = options.client;
    this.now = options.now ?? Date.now;
  }

  open(handlers: TransportHandlers): Promise<void> {
    this.handlers = handlers;
    this.openedAt = this.now();
    this.unsubscribe = this.client.subscribe((message) => this.observe(message));
    return Promise.resolve();
  }

  send(channel: ChannelName, bytes: Uint8Array): void {
    const message = this.toRoomMessage(channel, bytes);
    if (message === undefined) {
      this.drops += 1;
      if (!this.warned.has(channel)) {
        this.warned.add(channel);
        console.warn(`Dropped an oversized or malformed net.${channel} transport frame`);
      }
      return;
    }
    this.bytesOut += bytes.byteLength;
    this.client.send(message);
  }

  stats(): TransportStats {
    return {
      kind: this.kind,
      rttMs: this.rtt.ms,
      jitterMs: this.jitter.ms,
      // A pair is only as good as its worse direction; an unused direction reads 0 and never wins the maximum.
      lossPct: Math.max(this.snapshotLoss.pct, this.inputLoss.pct),
      bytesOut: this.bytesOut,
      bytesIn: this.bytesIn,
      drops: this.drops,
      connectedMs: this.openedAt === undefined ? 0 : this.now() - this.openedAt,
    };
  }

  close(reason: string): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.handlers?.closed(reason);
  }

  private toRoomMessage(channel: ChannelName, bytes: Uint8Array): ClientMessage | undefined {
    if (channel === 'input') {
      const frame = decodeInputFrame(bytes);
      if (frame === undefined) return undefined;
      if (textEncoder.encode(JSON.stringify(frame)).byteLength > LIMITS.inputBytes) return undefined;
      return { t: 'input', f: frame };
    }
    if (channel === 'state') {
      const frame = decodeStateFrame(bytes);
      if (frame === undefined || frame.data.byteLength > LIMITS.snapshotBytes) return undefined;
      return { t: 'snapshot', seq: frame.seq, tick: frame.tick, data: frame.data };
    }
    const frame = decodeEventFrame(bytes);
    if (frame === undefined || frame.data.byteLength > LIMITS.eventBytes) return undefined;
    return { t: 'event', seq: frame.seq, data: frame.data };
  }

  private observe(message: ServerMessage): void {
    const at = this.now();
    switch (message.t) {
      case 'pong': {
        const sample = Math.max(0, at - message.c);
        this.rtt.add(sample);
        this.jitter.add(sample);
        this.handlers?.stats(this.stats());
        return;
      }
      case 'snapshot': {
        this.snapshotLoss.observe(message.seq, at);
        this.bytesIn += message.data.byteLength;
        this.handlers?.message('state', ALL_SEATS, encodeStateFrame(message.seq, message.tick, message.data));
        return;
      }
      case 'input': {
        this.inputLoss.observe(message.f.seq, at);
        this.bytesIn += textEncoder.encode(JSON.stringify(message.f)).byteLength;
        this.handlers?.message('input', message.f.playerIndex, encodeInputFrame(message.f));
        return;
      }
      case 'event': {
        this.bytesIn += message.data.byteLength;
        this.handlers?.message('event', ALL_SEATS, encodeEventFrame(message.seq, message.data));
        return;
      }
      default:
        return;
    }
  }
}
