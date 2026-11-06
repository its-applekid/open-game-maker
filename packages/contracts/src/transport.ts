/*
 * The channel-typed transport seam (netcode platform §6.1–§6.2).
 *
 * These types live in `@ogm/contracts` while the implementations live in `apps/web/src/net/transport/` (N4), because
 * `@ogm/gm-verify` is a test-only package and must not import app source. N4's module re-exports them from here; one
 * declaration, so the app and the link simulator cannot drift apart (D-N6-4).
 */

/**
 * Three fixed delivery properties. Reliability is a property of the channel, not a per-call argument, so a caller cannot
 * accidentally put an input on a reliable ordered channel and head-of-line block the whole match.
 */
export type ChannelName = 'input' | 'state' | 'event';

export type TransportKind = 'ws-relay' | 'webrtc';

/** The relay is not keyed to one peer, so its `seat` is this sentinel; a pair transport carries a real seat. */
export const ALL_SEATS = -1;

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
  /** `seat` is the sending seat; a transport never invents one. */
  message(channel: ChannelName, seat: number, bytes: Uint8Array): void;
  stats(stats: TransportStats): void;
  /** Fired once per close of the current connection; a transport may be reopened after it. */
  closed(reason: string): void;
}

export interface Transport {
  readonly kind: TransportKind;
  /** The remote seat this transport talks to; the switchboard keys pairs by it. */
  readonly seat: number;
  open(handlers: TransportHandlers): Promise<void>;
  send(channel: ChannelName, bytes: Uint8Array): void;
  stats(): TransportStats;
  close(reason: string): void;
}
