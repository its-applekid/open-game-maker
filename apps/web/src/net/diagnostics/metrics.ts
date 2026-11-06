/**
 * The diagnostics overlay's data layer (netcode platform §8.2, research #499 §3.4–§3.6).
 *
 * Diagnostics are local: each client measures its own seat. Nothing here fetches, posts or uploads — the overlay polls
 * the game through the bridge the test harness already uses (`test.renderInfo`, refused outright by a published build),
 * joins it with the room state and the transport's own numbers, and renders. One sampler, one snapshot shape, so the
 * four overlay lines and the JSON log line read the same numbers.
 */

/** The metrics the game reports through `test.renderInfo`, as far as the overlay uses them. */
export type NetInfo = {
  mode?: 'host' | 'per-seat' | 'rollback';
  epoch?: string;
  tick?: number;
  lateStartTicks?: number;
  inputDelayTicks?: number;
  inputGaps?: number;
  localResponseMs?: number;
  remoteUpdateMs?: number;
  /** Present once the SDK keeps a p95 of its own; the overlay labels the number `p95` only when this one exists. */
  remoteUpdateP95Ms?: number;
  eventDelayMs?: number;
  eventDelayP95Ms?: number;
  clockOffsetMs?: number;
  desyncs?: number;
  recoveries?: number;
  hardResyncs?: number;
  droppedBytes?: number;
  oversized?: number;
};

/** The facts the room already broadcasts. A seat's own numbers are never read from here. */
export type RoomFacts = {
  buildId?: string;
  rulesetHash?: string;
  epoch?: string;
  phase?: string;
  /** This client's seat, or `undefined` for a spectator or a game with no room. */
  seat?: number;
  /** How many seats the room has; the overlay shows `seat n/total`. */
  seats?: number;
  maxPlayers?: number;
};

export type TransportFacts = { rttMs?: number; jitterMs?: number; lossPct?: number };

export type NetInfoSnapshot = { net: NetInfo; room: RoomFacts; transport: TransportFacts };

export type NetInfoSources = {
  /** `test.renderInfo` from the game frame; resolves `undefined` when the game refused it or did not answer. */
  readInfo(): Promise<unknown>;
  room(): RoomFacts;
  transport?(): TransportFacts;
};

const NUMERIC = [
  'tick',
  'lateStartTicks',
  'inputDelayTicks',
  'inputGaps',
  'localResponseMs',
  'remoteUpdateMs',
  'remoteUpdateP95Ms',
  'eventDelayMs',
  'eventDelayP95Ms',
  'clockOffsetMs',
  'desyncs',
  'recoveries',
  'hardResyncs',
  'droppedBytes',
  'oversized',
] as const;

/**
 * Reads the game's `net` object out of an untyped bridge reply. A value of the wrong type is treated as absent rather
 * than rendered: a game that reports nonsense must not make the overlay lie.
 */
export function parseNetInfo(value: unknown): NetInfo {
  const net = (value as { net?: unknown } | undefined)?.net;
  if (net === null || typeof net !== 'object') return {};
  const record = net as Record<string, unknown>;
  const info: NetInfo = {};
  for (const key of NUMERIC) {
    const candidate = record[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) info[key] = candidate;
  }
  if (record.mode === 'host' || record.mode === 'per-seat' || record.mode === 'rollback') info.mode = record.mode;
  if (typeof record.epoch === 'string') info.epoch = record.epoch;
  return info;
}

/** One snapshot: the game's metrics, the room's broadcast facts and the transport's path quality. */
export async function collectNetMetrics(sources: NetInfoSources): Promise<NetInfoSnapshot | undefined> {
  let reply: unknown;
  try {
    reply = await sources.readInfo();
  } catch {
    return undefined;
  }
  if (reply === undefined) return undefined;
  const room = sources.room();
  const transport = sources.transport?.() ?? {};
  return {
    net: parseNetInfo(reply),
    room,
    transport,
  };
}

const DASH = '–';

const int = (value: number | undefined): string => (value === undefined ? DASH : String(Math.round(value)));
const ms = (value: number | undefined): string => (value === undefined ? DASH : String(Math.round(value)));
const tenths = (value: number | undefined): string =>
  value === undefined ? DASH : (Math.round(value * 10) / 10).toFixed(1);
const count = (value: number | undefined): string => (value === undefined ? DASH : String(value));
const signed = (value: number | undefined): string =>
  value === undefined ? DASH : `${value > 0 ? '+' : value < 0 ? '-' : ''}${Math.abs(Math.round(value))}`;

/**
 * The four overlay lines, exactly (§3.5): identity and agreement, path quality, simulation delays, failure counters.
 * A value that is not yet known renders `–` rather than `0`, because "0 ms of round trip" and "not measured" must not
 * look alike. A game with no net controller is `solo`, and the path and delay rows say nothing rather than zeroes.
 */
export function metricLines(snapshot: NetInfoSnapshot): string[] {
  const { net, room, transport } = snapshot;
  const seats = room.seats ?? room.maxPlayers;
  const counters = [
    `desync ${count(net.desyncs)}`,
    `recoveries ${count(net.recoveries)}`,
    `hard ${count(net.hardResyncs)}`,
    `dropped ${net.droppedBytes === undefined ? DASH : String(net.droppedBytes)} B`,
    `oversized ${count(net.oversized)}`,
  ].join(' · ');

  if (net.mode === undefined) return ['solo', DASH, DASH, counters];

  return [
    [
      `seat ${room.seat === undefined ? DASH : room.seat}/${seats === undefined ? DASH : seats}`,
      net.mode,
      `tick ${int(net.tick)}`,
      `epoch ${net.epoch ?? room.epoch ?? DASH}`,
      `build ${room.buildId ?? DASH}`,
      `ruleset ${room.rulesetHash ?? DASH}`,
    ].join(' · '),
    [
      `rtt ${ms(transport.rttMs)} ms`,
      `jitter ${ms(transport.jitterMs)} ms`,
      `loss ${tenths(transport.lossPct)}%`,
      `clock ${signed(net.clockOffsetMs)} ms`,
    ].join(' · '),
    [
      `local ${tenths(net.localResponseMs)} ms`,
      `remote ${ms(net.remoteUpdateP95Ms ?? net.remoteUpdateMs)} ms${net.remoteUpdateP95Ms === undefined ? '' : ' p95'}`,
      `event ${ms(net.eventDelayP95Ms ?? net.eventDelayMs)} ms${net.eventDelayP95Ms === undefined ? '' : ' p95'}`,
      `delay ${int(net.inputDelayTicks)} ticks`,
      `gaps ${count(net.inputGaps)}`,
    ].join(' · '),
    counters,
  ];
}

/**
 * One JSON object per window, with the same field names the verify report's `SeatMetrics` uses, so a captured log and a
 * captured report can be read side by side. `console.info`, never an error or a warning: the verify `ConsoleCollector`
 * records those, and a diagnostics line must never colour a verdict.
 */
export function logLine(snapshot: NetInfoSnapshot, now: number): string {
  const { net, room, transport } = snapshot;
  const fields: Record<string, number | string> = { t: now };
  const put = (key: string, value: number | string | undefined) => {
    if (value !== undefined) fields[key] = value;
  };
  put('seat', room.seat);
  put('mode', net.mode);
  put('epoch', net.epoch ?? room.epoch);
  put('tick', net.tick);
  put('buildId', room.buildId);
  put('rulesetHash', room.rulesetHash);
  put('rttMs', transport.rttMs);
  put('jitterMs', transport.jitterMs);
  put('lossPct', transport.lossPct);
  put('clockOffsetMs', net.clockOffsetMs);
  put('lateStartTicks', net.lateStartTicks);
  put('inputDelayTicks', net.inputDelayTicks);
  put('inputGaps', net.inputGaps);
  put('localResponseMs', net.localResponseMs);
  put('remoteUpdateP95Ms', net.remoteUpdateP95Ms ?? net.remoteUpdateMs);
  put('eventDelayP95Ms', net.eventDelayP95Ms ?? net.eventDelayMs);
  put('desyncs', net.desyncs);
  put('recoveries', net.recoveries);
  put('hardResyncs', net.hardResyncs);
  put('droppedBytes', net.droppedBytes);
  put('oversized', net.oversized);
  return `[ogm.net] ${JSON.stringify(fields)}`;
}
