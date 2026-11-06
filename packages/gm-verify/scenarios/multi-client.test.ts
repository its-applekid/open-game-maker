import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { HarnessSnapshot } from './multi-client/harness.ts';
import {
  bandsFor,
  judgeSeat,
  LIMITS,
  MULTI_UNCHECKED,
  profileFor,
  runMultiClient,
  toSeatMetrics,
  type LinkProfileName,
} from './multi-client.ts';
import { verifyReportSchema } from '../src/report.js';
import { BAD_LINK, CLEAN_LINK } from '../src/link/schedule.js';

/* The full run needs a built rooms service and Chromium; CI runs only the pure tests below. */
// eslint-disable-next-line no-restricted-properties -- opt-in switch for a host-only scenario, not configuration
const enabled = process.env.OGM_SCENARIOS === '1';
// eslint-disable-next-line no-restricted-properties -- same opt-in, see above
const softwareGl = process.env.GM_VERIFY_SOFTWARE_GL === '1';
const TEMPLATE = fileURLToPath(new URL('../../../templates/game-multiplayer/', import.meta.url));

function sample(overrides: Partial<HarnessSnapshot> = {}): HarnessSnapshot {
  return {
    seat: 0,
    mode: 'per-seat',
    epoch: 'e1',
    tick: 120,
    buildId: 'b1',
    rulesetHash: 'r1',
    rttMs: 80,
    jitterMs: 20,
    lossPct: 2,
    clockOffsetMs: 8,
    lateStartTicks: 0,
    inputDelayTicks: 3,
    inputGaps: 0,
    localResponseMs: 16,
    remoteUpdateMs: 90,
    eventDelayMs: 120,
    desyncs: 0,
    recoveries: 0,
    hardResyncs: 0,
    droppedBytes: 0,
    oversized: 0,
    ...overrides,
  };
}

describe('the multi-client bands and verdict', () => {
  it('writes the impairment into the bad profile bound and leaves the clean one at the relay budget', () => {
    expect(bandsFor(CLEAN_LINK)).toMatchObject({
      localResponseMs: 17,
      remoteUpdateP95Ms: 100,
      eventDelayP95Ms: 150,
      inputGaps: 1,
      needsRecovery: false,
    });
    /* latencyMs 40 + 2 × jitter 20 = 80 ms of headroom, and this profile schedules a disconnect. */
    expect(bandsFor(BAD_LINK)).toMatchObject({
      remoteUpdateP95Ms: 180,
      eventDelayP95Ms: 230,
      inputGaps: 2,
      needsRecovery: true,
    });
  });

  it('names every seat that misses a band', () => {
    const bands = bandsFor(BAD_LINK);
    const failing = toSeatMetrics(2, [
      sample({
        seat: 2,
        localResponseMs: 40,
        remoteUpdateMs: 400,
        eventDelayMs: 500,
        inputGaps: 5,
        desyncs: 1,
        hardResyncs: 2,
        oversized: 3,
        recoveries: 0,
      }),
    ]);

    expect(judgeSeat(failing, bands)).toEqual([
      'seat 2 localResponseMs 40 > 17',
      'seat 2 remoteUpdateP95Ms 400 > 180',
      'seat 2 eventDelayP95Ms 500 > 230',
      'seat 2 inputGaps 5 > 2',
      'seat 2 desyncs 1 > 0',
      'seat 2 hardResyncs 2 > 0',
      'seat 2 oversized 3 > 0',
      'seat 2 recoveries 0 < 1 after its 3 s drop',
    ]);
  });

  it('passes a seat inside its band', () => {
    expect(judgeSeat(toSeatMetrics(0, [sample()]), bandsFor(BAD_LINK))).toEqual([]);
  });
});

describe('folding samples into a seat entry', () => {
  it('keeps the latest gauges and takes the nearest-rank p95 of the two delays', () => {
    const delays = Array.from({ length: 100 }, (_, index) => index + 1);
    const seat = toSeatMetrics(1, [
      ...delays.map((delay) => sample({ seat: 1, remoteUpdateMs: delay, eventDelayMs: delay })),
      sample({ seat: 1, tick: 999, remoteUpdateMs: 400, eventDelayMs: 400, recoveries: 2 }),
    ]);

    expect(seat.seat).toBe(1);
    expect(seat.tick).toBe(999);
    /* ceil(0.95 × 101) = 96 → the 400 lands last, so the p95 is the 96th smallest sample. */
    expect(seat.remoteUpdateP95Ms).toBe(96);
    expect(seat.eventDelayP95Ms).toBe(96);
    expect(seat.recoveries).toBe(2);
    expect(seat.buildId).toBe('b1');
    expect(seat.rulesetHash).toBe('r1');
  });

  it('omits an epoch and a ruleset hash it never had instead of writing an empty string', () => {
    const seat = toSeatMetrics(0, [sample({ epoch: '', rulesetHash: undefined })]);

    expect(seat.epoch).toBeUndefined();
    expect(seat.rulesetHash).toBeUndefined();
  });
});

describe('profileFor', () => {
  it('reads the two named profiles and passes an explicit profile through', () => {
    expect(profileFor('clean')).toEqual(CLEAN_LINK);
    expect(profileFor('bad')).toEqual(BAD_LINK);
    expect(profileFor(BAD_LINK)).toEqual(BAD_LINK);
    expect(profileFor(undefined)).toEqual(BAD_LINK);
    expect(() => profileFor('terrible' as LinkProfileName)).toThrow(/unknown link profile/);
  });

  it('replays the link object a report carries', () => {
    const report = JSON.parse(readFileSync(REPLAY_FIXTURE, 'utf8')) as { link: typeof BAD_LINK };

    expect(profileFor(report.link)).toEqual(report.link);
  });
});

const REPLAY_FIXTURE = fileURLToPath(new URL('../fixtures/link/seed-1234.json', import.meta.url));

describe.skipIf(!enabled)('multi-client scenario (OGM_SCENARIOS=1)', () => {
  it('runs the eight §3.8 steps on a bad link and writes a four-seat report', async () => {
    const out = mkdtempSync(join(tmpdir(), 'gm-multi-client-out-'));
    try {
      const { report, reportPath, seats } = await runMultiClient({ gameDir: TEMPLATE, out, softwareGl, link: 'bad' });

      expect(report.error).toBeUndefined();
      expect(report.verdict).toBe('pass');
      const parsed = verifyReportSchema.parse(JSON.parse(readFileSync(reportPath, 'utf8')));
      expect(parsed.clients).toBe(4);
      expect(parsed.seats).toHaveLength(4);
      expect(parsed.link).toEqual(BAD_LINK);
      expect(parsed.unchecked).toEqual(expect.arrayContaining(['iPhone Safari', 'WAN latency', 'a real phone']));
      expect(seats.map((seat) => seat.seat)).toEqual([0, 1, 2, 3]);
      expect(Number(report.probes.welcomeMs)).toBeLessThanOrEqual(LIMITS.welcomeMs);
      expect(Number(report.probes.playSwitchMs)).toBeLessThanOrEqual(LIMITS.playSwitchMs);
      expect(report.probes.draftPin).toBe('b2');
      expect(report.probes.linkSeed).toBe(BAD_LINK.seed);
      expect(judgeSeat(seats[2]!, bandsFor(BAD_LINK))).toEqual([]);
      expect(seats[2]!.recoveries).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 300_000);

  it('runs the same eight steps on a clean link', async () => {
    const out = mkdtempSync(join(tmpdir(), 'gm-multi-client-clean-'));
    try {
      const { report, seats } = await runMultiClient({ gameDir: TEMPLATE, out, softwareGl, link: 'clean' });

      expect(report.error).toBeUndefined();
      expect(report.verdict).toBe('pass');
      for (const seat of seats) {
        expect(seat.desyncs).toBe(0);
        expect(seat.droppedBytes).toBe(0);
        expect(seat.oversized).toBe(0);
      }
      expect(MULTI_UNCHECKED).toContain('a real phone');
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 300_000);
});
