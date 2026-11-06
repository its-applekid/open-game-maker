import { decide } from './select';
import { WindowedStats } from './stats';
import { TRANSPORT_LIMITS, type ChannelName, type Transport, type TransportKind, type TransportStats } from './types';
import { WebRtcTransport, webRtcAvailable, type SignalSink } from './webrtc';

/**
 * One switchboard per room (N4, #498 §4.1): it owns the pairs, routes `send()` per channel and is the only place that
 * decides which path a seat's traffic takes.
 *
 * The relay is the default and the fallback. A pair is promoted only after `probeMs` of measured baseline and only when
 * that baseline is bad; a promotion is announced before the first byte travels on the new path, because two seats that
 * disagree about which path carried a message cannot diagnose a lost one.
 */

export * from './frames';
export * from './select';
export * from './stats';
export * from './types';
export * from './webrtc';
export * from './ws-relay';

export type TransportNotice = { seat: number; kind: TransportKind };

export interface TransportSwitchboard {
  /** `to` names the remote seat the bytes are for; `undefined` broadcasts them through the relay. */
  send(channel: ChannelName, bytes: Uint8Array, to?: number): void;
  /** One entry per remote seat, live. */
  stats(): ReadonlyMap<number, TransportStats>;
  /** Prompt a decision now; the switchboard also ticks on its own `statsEveryMs`. */
  evaluate(): void;
  close(reason: string): void;
  /** N3 calls this on `net.start`: one attempt per epoch per pair means a failed pair gets a fresh chance. */
  beginEpoch(): void;
  /**
   * N3 reports the room's event delivery health for one seat. Events never ride a pair, so a failing event channel is
   * the one signal that sends a promoted pair back to the relay (§6.5, "demote when the event channel fails").
   */
  setEventsOk(seat: number, ok: boolean): void;
}

export type SwitchboardOptions = {
  relay: Transport;
  localSeat: number;
  peers: readonly number[];
  /** N3's `net.signal`, absent on a v1 room; without it no pair is ever attempted. */
  signal?: SignalSink;
  /** Injected in tests; defaults to `WebRtcTransport` when the browser has one. */
  createCandidate?: (seat: number) => Transport;
  iceUrls?: readonly string[];
  now?: () => number;
  /** Inbound frames from a promoted pair; N3's bridge consumes this. The relay keeps its own subscription for v1. */
  onMessage?: (channel: ChannelName, seat: number, bytes: Uint8Array) => void;
  /** Every transition, for N3's `net.transport` notice and for N6's overlay. */
  announce?: (notice: TransportNotice) => void;
  /** Tests call `evaluate()` directly and pass false. */
  autoTick?: boolean;
};

type Pair = {
  state: 'ws-relay' | 'attempting' | 'webrtc';
  attempted: boolean;
  candidate?: Transport;
  window: WindowedStats;
  eventsOk: boolean;
};

export function createSwitchboard(options: SwitchboardOptions): TransportSwitchboard {
  const now = options.now ?? Date.now;
  const relay = options.relay;
  const localSeat = options.localSeat;
  const peers = [...new Set(options.peers.filter((seat) => seat !== localSeat))].sort((left, right) => left - right);
  const pairs = new Map<number, Pair>(peers.map((seat) => [seat, newPair()]));
  const epochStartedAt = now();
  const factory = options.createCandidate ?? defaultCandidateFactory(options);
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  relay
    .open({
      message: (channel, seat, bytes) => options.onMessage?.(channel, seat, bytes),
      stats: () => {},
      closed: () => {},
    })
    .catch(() => {
      // A relay that cannot open leaves the switchboard idle; the room client owns the visible failure.
    });

  const switchboard: TransportSwitchboard = {
    send(channel, bytes, to) {
      if (closed) return;
      // Events are rules-relevant and always go through the room: one authority, no dual-receive dedupe (§1.4).
      if (channel === 'event' || to === undefined) {
        relay.send(channel, bytes);
        return;
      }
      const pair = pairs.get(to);
      if (pair?.state === 'webrtc' && pair.candidate !== undefined) {
        pair.candidate.send(channel, bytes);
        return;
      }
      relay.send(channel, bytes);
    },

    stats() {
      const entries = new Map<number, TransportStats>();
      const relayStats = relay.stats();
      for (const [seat, pair] of pairs) entries.set(seat, pair.candidate?.stats() ?? relayStats);
      return entries;
    },

    evaluate() {
      if (closed) return;
      const at = now();
      const relayStats = relay.stats();
      const elapsedMs = at - epochStartedAt;
      for (const [seat, pair] of pairs) {
        const candidateStats = pair.candidate?.stats();
        if (candidateStats !== undefined) pair.window.observe(candidateStats.rttMs, at);
        const decision = decide({
          state: pair.state,
          elapsedMs,
          relay: relayStats,
          ...(candidateStats === undefined ? {} : { candidate: candidateStats }),
          candidateConnectedMs: pair.window.msAbove(relayStats.rttMs * TRANSPORT_LIMITS.demoteFactor, at),
          eventsOk: pair.eventsOk,
        });

        if (decision === 'attempt-webrtc') attempt(seat, pair);
        if (decision === 'promote') {
          announce({ seat, kind: 'webrtc' });
          pair.state = 'webrtc';
        }
        if (decision === 'demote') demote(seat, pair, 'demoted to the relay');
      }
    },

    close(reason) {
      if (closed) return;
      closed = true;
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      for (const pair of pairs.values()) {
        const transport = pair.candidate;
        pair.candidate = undefined;
        pair.state = 'ws-relay';
        transport?.close(reason);
      }
      relay.close(reason);
    },

    beginEpoch() {
      for (const pair of pairs.values()) {
        const transport = pair.candidate;
        pair.candidate = undefined;
        pair.state = 'ws-relay';
        pair.attempted = false;
        pair.eventsOk = true;
        pair.window.reset();
        transport?.close('epoch ended');
      }
    },

    setEventsOk(seat, ok) {
      const pair = pairs.get(seat);
      if (pair === undefined) return;
      pair.eventsOk = ok;
      // Demote on the report rather than on the next tick: the pair cannot carry the events this seat needs.
      if (!ok && pair.state === 'webrtc') demote(seat, pair, 'event channel failed');
    },
  };

  function announce(notice: TransportNotice): void {
    options.announce?.(notice);
  }

  function attempt(seat: number, pair: Pair): void {
    if (pair.attempted || factory === undefined) return;
    pair.attempted = true;
    pair.state = 'attempting';
    const transport = factory(seat);
    pair.candidate = transport;
    transport
      .open({
        message: (channel, from, bytes) => options.onMessage?.(channel, from, bytes),
        stats: () => {},
        closed: () => onPairClosed(seat, transport),
      })
      .then(() => {
        if (pair.candidate !== transport) return;
        // Connected but not yet promoted: the relay still carries this pair until a measurement says otherwise.
        if (pair.state === 'attempting') pair.state = 'ws-relay';
      })
      .catch(() => {
        if (pair.candidate === transport) pair.candidate = undefined;
        pair.state = 'ws-relay';
        transport.close('attempt failed');
      });
  }

  function onPairClosed(seat: number, transport: Transport): void {
    const pair = pairs.get(seat);
    if (pair === undefined || pair.candidate !== transport) return;
    if (pair.state === 'webrtc') demote(seat, pair, 'pair closed');
    else {
      pair.candidate = undefined;
      pair.state = 'ws-relay';
    }
  }

  function demote(seat: number, pair: Pair, reason: string): void {
    const transport = pair.candidate;
    const wasPromoted = pair.state === 'webrtc';
    pair.candidate = undefined;
    pair.state = 'ws-relay';
    if (wasPromoted) announce({ seat, kind: 'ws-relay' });
    transport?.close(reason);
  }

  if (options.autoTick !== false) timer = setInterval(() => switchboard.evaluate(), TRANSPORT_LIMITS.statsEveryMs);

  return switchboard;
}

function newPair(): Pair {
  return {
    state: 'ws-relay',
    attempted: false,
    window: new WindowedStats(TRANSPORT_LIMITS.demoteWindowMs),
    eventsOk: true,
  };
}

function defaultCandidateFactory(options: SwitchboardOptions): ((seat: number) => Transport) | undefined {
  const signal = options.signal;
  if (signal === undefined || !webRtcAvailable()) return undefined;
  return (seat) =>
    new WebRtcTransport({
      seat,
      // The lower seat id offers, so there is no glare to resolve.
      role: options.localSeat < seat ? 'offerer' : 'answerer',
      signal,
      ...(options.iceUrls === undefined ? {} : { iceUrls: options.iceUrls }),
      ...(options.now === undefined ? {} : { now: options.now }),
    });
}
