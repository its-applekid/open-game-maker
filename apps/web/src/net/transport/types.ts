/**
 * The transport seam of `docs/plans/netcode-platform.md` §6 (N4, #498).
 *
 * A transport carries three channels with fixed delivery properties. Reliability is a property of the channel, not a
 * per-call argument, so a caller cannot accidentally put an input on a reliable ordered channel and head-of-line block
 * the whole match. The seam sits below `bridge-forwarding.ts`: the game iframe, the bridge envelopes and the room
 * protocol never learn which transport carried a byte.
 *
 * The declarations themselves live in `@ogm/contracts` because `@ogm/gm-verify`'s link simulator implements them and a
 * test-only package must not import app source. One declaration of the seam, re-exported here so every app import keeps
 * working (D-N6-4).
 */

import type { TransportStats } from '@ogm/contracts/transport';

export type {
  ChannelName,
  Transport,
  TransportHandlers,
  TransportKind,
  TransportStats,
} from '@ogm/contracts/transport';
export { ALL_SEATS } from '@ogm/contracts/transport';

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
