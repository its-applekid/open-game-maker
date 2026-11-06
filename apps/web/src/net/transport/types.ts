/**
 * The transport seam of `docs/plans/netcode-platform.md` §6 (N4, #498).
 *
 * A transport carries three channels with fixed delivery properties. Reliability is a property of the channel, not a
 * per-call argument, so a caller cannot accidentally put an input on a reliable ordered channel and head-of-line block
 * the match. The seam sits below `bridge-forwarding.ts`: the game iframe, the bridge envelopes and the room protocol
 * never learn which transport carried a byte.
 */

/** `input` and `state` are latest-wins; `event` is rules-relevant and never rides a lossy channel. */
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

/**
 * The selection policy of §6.5, in the units the measurements behind it use: `probeMs` is ~300 input frames and 100
 * snapshots, `rttThresholdMs` is most of a 60 Hz frame budget once a relay leg is added on top of it, and
 * `lossThresholdPct` is the chunk loss at which a stalled TCP segment already costs ~194 ms of extra delivery.
 */
export const TRANSPORT_LIMITS = {
  probeMs: 5_000,
  rttThresholdMs: 80,
  lossThresholdPct: 2,
  promoteGainPct: 30,
  demoteFactor: 2,
  demoteWindowMs: 5_000,
  attemptTimeoutMs: 5_000,
  statsEveryMs: 1_000,
} as const;

/** A pair that has not reported a round trip yet is not comparable with the relay; the selector treats 0 as unknown. */
export function isComparable(stats: TransportStats | undefined): stats is TransportStats {
  return stats !== undefined && stats.rttMs > 0;
}
