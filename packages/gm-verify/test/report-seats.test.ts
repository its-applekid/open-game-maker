import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { summaryLines, verifyReportSchema, writeReport, type SeatMetrics } from '../src/report.js';

const FIXTURES = fileURLToPath(new URL('../fixtures/report/', import.meta.url));
const dirs: string[] = [];

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gm-report-seats-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A pre-N6 report: the two-client verify's shape, captured before seats and link existed. */
function preN6(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES, 'pre-n6.json'), 'utf8')) as Record<string, unknown>;
}

function seat(overrides: Partial<SeatMetrics> = {}): SeatMetrics {
  return {
    seat: 0,
    buildId: 'b1',
    rulesetHash: '7c1e',
    epoch: '3f9a',
    mode: 'per-seat',
    tick: 1234,
    rttMs: 41,
    jitterMs: 8,
    lossPct: 0,
    clockOffsetMs: 12,
    lateStartTicks: 0,
    inputDelayTicks: 3,
    inputGaps: 0,
    localResponseMs: 16.7,
    remoteUpdateP95Ms: 84,
    eventDelayP95Ms: 96,
    desyncs: 0,
    recoveries: 1,
    hardResyncs: 0,
    droppedBytes: 0,
    oversized: 0,
    ...overrides,
  };
}

describe('the report schema stays additive for seats and link', () => {
  it('parses a pre-N6 report and defaults seats to an empty list with no link', () => {
    const parsed = verifyReportSchema.parse(preN6());

    expect(parsed.seats).toEqual([]);
    expect(parsed.link).toBeUndefined();
    expect(parsed.clients).toBe(2);
    expect(Object.keys(parsed.probes)).toEqual(Object.keys(preN6().probes as Record<string, unknown>));
  });

  it('summarises a pre-N6 report byte for byte as it did before seats existed', () => {
    expect(summaryLines(verifyReportSchema.parse(preN6()))).toEqual([
      'renderer ANGLE (Intel, Mesa Intel(R) Graphics (ADL GT2), OpenGL ES 3.2)',
      'downloadBytes 0 / 0 unknown',
      'drawCalls 0 / 0 unknown',
      'triangles 0 / 0 unknown',
      'textureBytes 0 / 0 unknown',
      'unchecked iPhone Safari, sound, WAN latency, sign-in',
      'verdict pass',
    ]);
  });

  it('round-trips one seat entry and one link profile', () => {
    const parsed = verifyReportSchema.parse({
      ...preN6(),
      clients: 4,
      seats: [seat(), seat({ seat: 2, desyncs: 1, recoveries: 2 })],
      link: {
        seed: 1234,
        latencyMs: 40,
        jitterMs: 20,
        lossPct: 2,
        reorderPct: 1,
        disconnects: [{ seat: 2, atMs: 4_000, downMs: 3_000 }],
      },
    });

    expect(parsed.seats.map((entry) => entry.seat)).toEqual([0, 2]);
    expect(parsed.seats[1]?.recoveries).toBe(2);
    expect(parsed.link?.seed).toBe(1234);
    expect(parsed.clients).toBe(4);
  });

  it('adds exactly one summary line for a run that reported seats, and no other line moves', () => {
    const withSeats = verifyReportSchema.parse({
      ...preN6(),
      seats: [seat(), seat({ seat: 1, recoveries: 0 }), seat({ seat: 2, desyncs: 2 }), seat({ seat: 3 })],
    });

    expect(summaryLines(withSeats)).toEqual([
      'renderer ANGLE (Intel, Mesa Intel(R) Graphics (ADL GT2), OpenGL ES 3.2)',
      'downloadBytes 0 / 0 unknown',
      'drawCalls 0 / 0 unknown',
      'triangles 0 / 0 unknown',
      'textureBytes 0 / 0 unknown',
      'seats 4 desyncs 2 recoveries 3',
      'unchecked iPhone Safari, sound, WAN latency, sign-in',
      'verdict pass',
    ]);
  });

  it('rejects a loss, a reorder rate or a seat index outside its bounds', () => {
    const bad = (patch: Record<string, unknown>) => verifyReportSchema.safeParse({ ...preN6(), ...patch }).success;

    expect(bad({ seats: [seat({ lossPct: 101 })] })).toBe(false);
    expect(bad({ seats: [seat({ seat: 8 })] })).toBe(false);
    expect(bad({ seats: [seat({ mode: 'server' as SeatMetrics['mode'] })] })).toBe(false);
    expect(bad({ seats: [seat(), seat(), seat(), seat(), seat(), seat(), seat(), seat(), seat()] })).toBe(false);
    expect(bad({ link: { seed: 1, latencyMs: 0, jitterMs: 0, lossPct: 101, reorderPct: 0, disconnects: [] } })).toBe(
      false,
    );
    expect(
      bad({
        link: {
          seed: 1,
          latencyMs: 0,
          jitterMs: 0,
          lossPct: 0,
          reorderPct: 0,
          disconnects: [{ seat: 9, atMs: 0, downMs: 0 }],
        },
      }),
    ).toBe(false);
  });

  it('leaves seats optional in the emitted JSON Schema, so a report written before N6 still validates', () => {
    const path = fileURLToPath(new URL('../schemas/verify-report.v1.json', import.meta.url));
    const schema = JSON.parse(readFileSync(path, 'utf8')) as {
      required: string[];
      properties: Record<string, unknown>;
    };

    expect(schema.required).not.toContain('seats');
    expect(schema.required).not.toContain('link');
    expect(schema.properties.seats).toBeDefined();
    expect(schema.properties.link).toBeDefined();
  });

  it('writes seats and link into report.json', () => {
    const dir = scratch();
    const path = writeReport(dir, {
      ...verifyReportSchema.parse(preN6()),
      seats: [seat()],
      link: { seed: 1234, latencyMs: 40, jitterMs: 20, lossPct: 2, reorderPct: 1, disconnects: [] },
    });

    const written = JSON.parse(readFileSync(path, 'utf8')) as { seats: SeatMetrics[]; link?: { seed: number } };
    expect(written.seats).toHaveLength(1);
    expect(written.link?.seed).toBe(1234);
    expect(readFileSync(join(dir, 'summary.txt'), 'utf8')).toContain('seats 1 desyncs 0 recoveries 1');
  });
});
