import { describe, expect, it } from 'vitest';

import { collectNetMetrics, logLine, metricLines, parseNetInfo, type NetInfoSnapshot } from './metrics';

/** The fixed snapshot T6 pins: a seated player on a four-seat room, every number known. */
function snapshot(): NetInfoSnapshot {
  return {
    net: {
      mode: 'per-seat',
      epoch: '3f9a',
      tick: 1234,
      lateStartTicks: 0,
      inputDelayTicks: 3,
      inputGaps: 0,
      localResponseMs: 16.7,
      remoteUpdateMs: 96,
      remoteUpdateP95Ms: 84,
      eventDelayMs: 120,
      eventDelayP95Ms: 96,
      clockOffsetMs: 12,
      desyncs: 0,
      recoveries: 0,
      hardResyncs: 0,
      droppedBytes: 0,
      oversized: 0,
    },
    room: { buildId: 'b2', rulesetHash: '7c1e', seat: 0, seats: 4 },
    transport: { rttMs: 41, jitterMs: 8, lossPct: 0 },
  };
}

describe('metricLines', () => {
  it('renders the four lines of the design exactly', () => {
    expect(metricLines(snapshot())).toEqual([
      'seat 0/4 · per-seat · tick 1234 · epoch 3f9a · build b2 · ruleset 7c1e',
      'rtt 41 ms · jitter 8 ms · loss 0.0% · clock +12 ms',
      'local 16.7 ms · remote 84 ms p95 · event 96 ms p95 · delay 3 ticks · gaps 0',
      'desync 0 · recoveries 0 · hard 0 · dropped 0 B · oversized 0',
    ]);
  });

  it('renders an unknown value as a dash, never as zero', () => {
    const unknown = snapshot();
    unknown.transport = {};

    expect(metricLines(unknown)[1]).toBe('rtt – ms · jitter – ms · loss –% · clock +12 ms');
    expect(metricLines(unknown)[0]).toContain('ruleset 7c1e');
  });

  it('labels the remote and event delays p95 only when the sample is a p95', () => {
    const latestOnly = snapshot();
    delete latestOnly.net.remoteUpdateP95Ms;
    delete latestOnly.net.eventDelayP95Ms;

    expect(metricLines(latestOnly)[2]).toBe('local 16.7 ms · remote 96 ms · event 120 ms · delay 3 ticks · gaps 0');
  });

  it('renders a single-player build as solo with no path or delay rows', () => {
    const solo: NetInfoSnapshot = { net: { droppedBytes: 0 }, room: {}, transport: {} };

    expect(metricLines(solo)).toEqual([
      'solo',
      '–',
      '–',
      'desync – · recoveries – · hard – · dropped 0 B · oversized –',
    ]);
  });
});

describe('logLine', () => {
  it('carries the seat metric names plus t, so a log and a report read side by side', () => {
    const parsed = JSON.parse(logLine(snapshot(), 1_760_000_000_000).replace('[ogm.net] ', '')) as Record<
      string,
      unknown
    >;

    expect(Object.keys(parsed).sort()).toEqual(
      [
        'buildId',
        'clockOffsetMs',
        'desyncs',
        'droppedBytes',
        'epoch',
        'eventDelayP95Ms',
        'hardResyncs',
        'inputDelayTicks',
        'inputGaps',
        'jitterMs',
        'lateStartTicks',
        'localResponseMs',
        'lossPct',
        'mode',
        'oversized',
        'recoveries',
        'remoteUpdateP95Ms',
        'rttMs',
        'rulesetHash',
        'seat',
        't',
        'tick',
      ].sort(),
    );
    expect(parsed.t).toBe(1_760_000_000_000);
    expect(parsed.eventDelayP95Ms).toBe(96);
  });

  it('omits a value it does not have instead of inventing a zero', () => {
    const parsed = JSON.parse(
      logLine({ net: { mode: 'host' }, room: { buildId: 'b1' }, transport: {} }, 5).replace('[ogm.net] ', ''),
    ) as Record<string, unknown>;

    expect(parsed).toEqual({ t: 5, mode: 'host', buildId: 'b1' });
  });
});

describe('collectNetMetrics', () => {
  it('joins the game metrics, the room facts and the transport numbers', async () => {
    const collected = await collectNetMetrics({
      readInfo: async () => ({ calls: 3, net: { mode: 'host', tick: 7, desyncs: 2, nonsense: 'x' } }),
      room: () => ({ buildId: 'b1', seat: 1, seats: 2 }),
      transport: () => ({ rttMs: 12 }),
    });

    expect(collected).toEqual({
      net: { mode: 'host', tick: 7, desyncs: 2 },
      room: { buildId: 'b1', seat: 1, seats: 2 },
      transport: { rttMs: 12 },
    });
  });

  it('answers undefined when the game refuses, throws or times out', async () => {
    const room = () => ({});
    await expect(collectNetMetrics({ readInfo: async () => undefined, room })).resolves.toBeUndefined();
    await expect(
      collectNetMetrics({
        readInfo: async () => {
          throw new Error('bridge closed');
        },
        room,
      }),
    ).resolves.toBeUndefined();
  });

  it('drops a metric of the wrong type rather than showing it', () => {
    expect(parseNetInfo({ net: { tick: 'thirty', desyncs: 1, mode: 'server', epoch: 'e1' } })).toEqual({
      desyncs: 1,
      epoch: 'e1',
    });
    expect(parseNetInfo({ calls: 1 })).toEqual({});
    expect(parseNetInfo(null)).toEqual({});
  });
});
