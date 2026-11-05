import type { ChannelName } from '@ogm/contracts';

/**
 * Bad-network simulation, the pure half (netcode platform §8.3, research #499 §3.7).
 *
 * `schedule.ts` decides what a simulated link does to one message and reads no clock, no timer and no random source:
 * the decisions are a pure function of `(config, channel, index)`, so the same seed replays byte for byte whatever
 * order the decisions are asked in. `transport.ts` applies them through an injected clock.
 */

export type Disconnect = { seat: number; atMs: number; downMs: number };

export type LinkConfig = {
  seed: number;
  /** One way, in ms. The design's "latency 80 ms" is an RTT, so it is 40 here. */
  latencyMs: number;
  /** ± this, uniform. */
  jitterMs: number;
  /** `input` and `state` only. */
  lossPct: number;
  /** `input` and `state` only. */
  reorderPct: number;
  /** Applied by wall-clock time by whoever drives the run, not per message. */
  disconnects: Disconnect[];
};

export type Delivery = { dropped: boolean; delayMs: number; reordered: boolean };

/** All zeroes: the profile a four-client run must pass with no help from the simulator. */
export const CLEAN_LINK: LinkConfig = {
  seed: 1,
  latencyMs: 0,
  jitterMs: 0,
  lossPct: 0,
  reorderPct: 0,
  disconnects: [],
};

/**
 * The impaired profile the four-client verify ships with: 40 ms one way plus ±20 ms jitter on every channel, 2 % loss
 * and 1 % reordering on `input` and `state`, and seat 2 offline for 3 s starting at 4 s.
 */
export const BAD_LINK: LinkConfig = {
  seed: 1234,
  latencyMs: 40,
  jitterMs: 20,
  lossPct: 2,
  reorderPct: 1,
  disconnects: [{ seat: 2, atMs: 4_000, downMs: 3_000 }],
};

/**
 * `event` is reliable and ordered per sender (§6.1), so the simulator delays it and never drops or reorders it. Dropping
 * an event would test a path the platform promises does not exist.
 */
export function isImpaired(channel: ChannelName): boolean {
  return channel !== 'event';
}

const CHANNEL_MASK: Record<ChannelName, number> = {
  input: 0x1f12_3bb5,
  state: 0x2545_f491,
  event: 0x9e37_79b9,
};

/** One avalanche round (murmur3's finalizer) over the seed, the channel and the message index. */
function mix32(seed: number, mask: number, index: number): number {
  let state = ((seed >>> 0) ^ mask ^ Math.imul(index + 1, 0x85eb_ca6b)) >>> 0;
  state = Math.imul(state ^ (state >>> 16), 0x7feb_352d) >>> 0;
  state = Math.imul(state ^ (state >>> 15), 0x846c_a68b) >>> 0;
  state = (state ^ (state >>> 16)) >>> 0;
  return state === 0 ? 0x9e37_79b9 : state;
}

/** xorshift32: three draws per message, so the byte stream is a pure function of `(seed, channel, index)`. */
function draws(state: number): [number, number, number] {
  const next = (): number => {
    state = (state ^ (state << 13)) >>> 0;
    state = (state ^ (state >>> 17)) >>> 0;
    state = (state ^ (state << 5)) >>> 0;
    return state / 4_294_967_296;
  };
  const first = next();
  const second = next();
  const third = next();
  return [first, second, third];
}

/** Returns the decision for one message. Pure: same `(config, channel, index)`, same `Delivery`, always. */
export function createLinkSchedule(config: LinkConfig): (channel: ChannelName, index: number) => Delivery {
  const { seed, latencyMs, jitterMs, lossPct, reorderPct } = config;

  return (channel, index) => {
    const [dropDraw, delayDraw, reorderDraw] = draws(mix32(seed, CHANNEL_MASK[channel], index));
    const impaired = isImpaired(channel);
    const delay = Math.max(0, Math.round(latencyMs + (delayDraw * 2 - 1) * jitterMs));

    return {
      dropped: impaired && dropDraw * 100 < lossPct,
      delayMs: delay,
      reordered: impaired && reorderDraw * 100 < reorderPct,
    };
  };
}
