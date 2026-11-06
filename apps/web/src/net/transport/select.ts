import { TRANSPORT_LIMITS, isComparable, type TransportStats } from './types';

/**
 * The per-pair selection policy of `docs/plans/netcode-platform.md` §6.5, tightened where the research for #498 (§4.3)
 * found a gap. Pure: no timers, no browser globals, no transport.
 *
 * The expected values in `select.test.ts` come from `node scripts/net/transport-bench.mjs --select`; a test that
 * disagrees with that table is a policy change and must say so in the PR.
 */

export type PairState = 'ws-relay' | 'attempting' | 'webrtc';

export type Decision = 'stay-ws-relay' | 'attempt-webrtc' | 'promote' | 'stay-webrtc' | 'demote';

export type DecisionInput = {
  state: PairState;
  /** Milliseconds since this pair's epoch began. */
  elapsedMs: number;
  relay: TransportStats;
  /** The attempted pair's stats; absent until a candidate exists and has reported. */
  candidate?: TransportStats;
  /**
   * How long the candidate has held its current measurement window — in practice the time its windowed median has been
   * above the demote bound. The switchboard feeds it so a pair connected for a minute still gets a full
   * `demoteWindowMs` of bad measurement before it is demoted.
   */
  candidateConnectedMs?: number;
  /** False when the relay's own event channel is failing for this pair. */
  eventsOk: boolean;
};

export function decide(input: DecisionInput): Decision {
  const { state, elapsedMs, relay, candidate, eventsOk } = input;
  const regressionMs = input.candidateConnectedMs ?? 0;

  if (state === 'attempting') {
    // The relay still carries this pair while the attempt is in flight, and one attempt per epoch is the rule.
    return 'stay-ws-relay';
  }

  if (state === 'webrtc') {
    if (!eventsOk) return 'demote';
    if (candidate === undefined) return 'demote';
    const bound = relay.rttMs * TRANSPORT_LIMITS.demoteFactor;
    // A relay with no round trip yet cannot be a baseline: comparing a real pair against 0 would demote it for nothing.
    if (isComparable(relay) && candidate.rttMs > bound && regressionMs >= TRANSPORT_LIMITS.demoteWindowMs) {
      return 'demote';
    }
    return 'stay-webrtc';
  }

  if (candidate === undefined) {
    const bad = relay.rttMs > TRANSPORT_LIMITS.rttThresholdMs || relay.lossPct > TRANSPORT_LIMITS.lossThresholdPct;
    return bad && elapsedMs >= TRANSPORT_LIMITS.probeMs ? 'attempt-webrtc' : 'stay-ws-relay';
  }

  const gain = relay.rttMs * (1 - TRANSPORT_LIMITS.promoteGainPct / 100);
  return isComparable(candidate) && isComparable(relay) && candidate.rttMs <= gain ? 'promote' : 'stay-ws-relay';
}
