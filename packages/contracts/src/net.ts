/*
 * Net contract family (netcode platform §6.1–§6.2). These are the types of the channel-typed transport seam, not room
 * messages: the host app owns a `Transport`, and the verify harness wraps one in its link simulator.
 *
 * They live in `@ogm/contracts` while the implementation lives in `apps/web/src/net/transport/` (N4), because
 * `@ogm/gm-verify` is a test-only package and must not import app source. Two declarations of the same seam would be a
 * drift bug waiting to happen (D-N6-4).
 */

/**
 * Three fixed delivery properties. Reliability is a property of the channel, not a per-call argument, so a caller cannot
 * accidentally put an input on a reliable ordered channel and head-of-line block the whole match.
 */
export type ChannelName = 'input' | 'state' | 'event';

export type TransportKind = 'ws-relay' | 'webrtc';

export interface TransportStats {
  readonly kind: TransportKind;
  readonly rttMs: number;
  readonly jitterMs: number;
  readonly lossPct: number;
  readonly bytesOut: number;
  readonly bytesIn: number;
  readonly drops: number;
  readonly connectedMs: number;
}

export interface TransportHandlers {
  /** One message on one channel, already stripped of whatever framing the transport used. */
  message(channel: ChannelName, bytes: Uint8Array): void;
  stats(stats: TransportStats): void;
  /** Fired once per close of the current connection; a transport may be reopened after it. */
  closed(reason: string): void;
}

export interface Transport {
  readonly kind: TransportKind;
  open(handlers: TransportHandlers): Promise<void>;
  send(channel: ChannelName, bytes: Uint8Array): void;
  stats(): TransportStats;
  close(reason: string): void;
}
