import { describe, expect, it } from 'vitest';

import { decide, type DecisionInput } from './select';
import { stats } from './test-support';

/**
 * The policy table of `docs/plans/netcode-platform.md` §6.5, with the expected values printed by
 * `node scripts/net/transport-bench.mjs --select`. Reverting `select.ts` to "always relay" fails rows 3, 4, 5, 8 and
 * 11; reverting it to "promote on any improvement" fails rows 6 and 7.
 */

const base: DecisionInput = { state: 'ws-relay', elapsedMs: 10_000, relay: stats({ rttMs: 3 }), eventsOk: true };

describe('decide', () => {
  it('stays on a relay whose round trip is fine, even after the probe window', () => {
    expect(decide(base)).toBe('stay-ws-relay');
  });

  it('stays on the relay while the probe window is still open', () => {
    expect(decide({ ...base, elapsedMs: 3_000, relay: stats({ rttMs: 95 }) })).toBe('stay-ws-relay');
  });

  it('attempts a pair when the relay round trip is above 80 ms', () => {
    expect(decide({ ...base, relay: stats({ rttMs: 95 }) })).toBe('attempt-webrtc');
  });

  it('attempts a pair when the relay loses more than 2 % even with a fast round trip', () => {
    expect(decide({ ...base, relay: stats({ rttMs: 40, lossPct: 3 }) })).toBe('attempt-webrtc');
  });

  it('promotes a candidate exactly 30 % better than the relay', () => {
    expect(
      decide({
        ...base,
        elapsedMs: 12_000,
        relay: stats({ rttMs: 100 }),
        candidate: stats({ kind: 'webrtc', rttMs: 70 }),
      }),
    ).toBe('promote');
  });

  it('stays on the relay when the candidate is only 20 % better', () => {
    expect(
      decide({
        ...base,
        elapsedMs: 12_000,
        relay: stats({ rttMs: 100 }),
        candidate: stats({ kind: 'webrtc', rttMs: 80 }),
      }),
    ).toBe('stay-ws-relay');
  });

  it('keeps a promoted pair running at 0.8x the relay', () => {
    expect(
      decide({
        ...base,
        state: 'webrtc',
        elapsedMs: 20_000,
        relay: stats({ rttMs: 100 }),
        candidate: stats({ kind: 'webrtc', rttMs: 80 }),
        candidateConnectedMs: 5_000,
      }),
    ).toBe('stay-webrtc');
  });

  it('demotes a promoted pair that regressed for the whole demote window', () => {
    expect(
      decide({
        ...base,
        state: 'webrtc',
        elapsedMs: 20_000,
        relay: stats({ rttMs: 100 }),
        candidate: stats({ kind: 'webrtc', rttMs: 240 }),
        candidateConnectedMs: 5_000,
      }),
    ).toBe('demote');
  });

  it('keeps a promoted pair through a regression shorter than the demote window', () => {
    expect(
      decide({
        ...base,
        state: 'webrtc',
        elapsedMs: 20_000,
        relay: stats({ rttMs: 100 }),
        candidate: stats({ kind: 'webrtc', rttMs: 240 }),
        candidateConnectedMs: 2_000,
      }),
    ).toBe('stay-webrtc');
  });

  it('demotes a promoted pair when the pair closes', () => {
    expect(
      decide({
        ...base,
        state: 'webrtc',
        elapsedMs: 20_000,
        relay: stats({ rttMs: 100 }),
        candidateConnectedMs: 1_000,
      }),
    ).toBe('demote');
  });

  it('demotes a promoted pair when the event channel fails', () => {
    expect(
      decide({
        ...base,
        state: 'webrtc',
        elapsedMs: 20_000,
        relay: stats({ rttMs: 100 }),
        candidate: stats({ kind: 'webrtc', rttMs: 40 }),
        eventsOk: false,
      }),
    ).toBe('demote');
  });

  it('never demotes a pair against a relay that has not measured a round trip yet', () => {
    expect(
      decide({
        ...base,
        state: 'webrtc',
        relay: stats({ rttMs: 0 }),
        candidate: stats({ kind: 'webrtc', rttMs: 120 }),
        candidateConnectedMs: 30_000,
      }),
    ).toBe('stay-webrtc');
  });

  it('never promotes a candidate that has not reported a round trip', () => {
    expect(decide({ ...base, relay: stats({ rttMs: 120 }), candidate: stats({ kind: 'webrtc', rttMs: 0 }) })).toBe(
      'stay-ws-relay',
    );
  });

  it('leaves an attempt in flight alone rather than starting a second one', () => {
    expect(decide({ ...base, state: 'attempting', relay: stats({ rttMs: 200 }) })).toBe('stay-ws-relay');
  });
});
