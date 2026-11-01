import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { verdictFor, verifyReportSchema, writeReport, type VerifyReport } from '../src/report.js';

/** The T10 §4 example, plus the fields V1 adds (paths relative to --out). */
function example(): VerifyReport {
  return {
    runId: 'r1',
    jobId: 'j1',
    aiurIssue: 123,
    renderer: 'ANGLE (Intel, Mesa Intel(R) Graphics (ADL GT2), OpenGL ES 3.2)',
    software: false,
    viewport: 'phone',
    tier: 'mobile',
    rig: 'iso',
    frames: [{ t: 0, path: 'phone/t0.png' }],
    timeline: 'phone/timeline.png',
    clip: 'phone/run.mp4',
    console: [{ level: 'error', text: 'boom', count: 3 }],
    budgets: {
      downloadBytes: [4_100_000, 6_000_000, 'ok'],
      drawCalls: [180, 250, 'ok'],
      triangles: [410_000, 300_000, 'over'],
      textureBytes: [0, 0, 'ok'],
    },
    probes: { alive: true, won: false },
    clients: 1,
    unchecked: ['iPhone Safari', 'sound'],
    verdict: 'fail',
    startedAt: '2026-11-01T10:00:00.000Z',
    endedAt: '2026-11-01T10:00:30.000Z',
    gmVerifyVersion: '0.1.0',
  };
}

describe('verify report schema', () => {
  it('accepts the T10 example', () => {
    expect(verifyReportSchema.safeParse(example()).success).toBe(true);
  });

  it('rejects a report without renderer, because consumers must know if the real GPU drew it', () => {
    const { renderer: _renderer, ...rest } = example();
    expect(verifyReportSchema.safeParse(rest).success).toBe(false);
    expect(verifyReportSchema.safeParse({ ...example(), renderer: '' }).success).toBe(false);
  });

  it('rejects a report without unchecked, or one that forgets iPhone Safari and sound', () => {
    const { unchecked: _unchecked, ...rest } = example();
    expect(verifyReportSchema.safeParse(rest).success).toBe(false);
    expect(verifyReportSchema.safeParse({ ...example(), unchecked: ['sound'] }).success).toBe(false);
  });

  it('rejects absolute or escaping frame paths (paths are relative to --out)', () => {
    expect(verifyReportSchema.safeParse({ ...example(), frames: [{ t: 0, path: '/tmp/t0.png' }] }).success).toBe(false);
    expect(verifyReportSchema.safeParse({ ...example(), clip: '../run.mp4' }).success).toBe(false);
  });
});

describe('verdictFor', () => {
  const ok = example().budgets;
  ok.triangles = [1, 300_000, 'ok'];

  it('fails on any budget over', () => {
    expect(verdictFor({ budgets: example().budgets, console: [] })).toBe('fail');
  });

  it('fails on any console error', () => {
    expect(verdictFor({ budgets: ok, console: [{ level: 'error', text: 'x', count: 1 }] })).toBe('fail');
  });

  it('passes with only warnings and unknown budgets', () => {
    const unknown = { ...ok, downloadBytes: [0, 6_000_000, 'unknown'] as [number, number, 'unknown'] };
    expect(verdictFor({ budgets: unknown, console: [{ level: 'warning', text: 'x', count: 9 }] })).toBe('pass');
  });
});

describe('writeReport', () => {
  it('writes report.json and a summary line per budget plus the verdict', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gm-report-'));
    const path = writeReport(dir, example());
    expect(JSON.parse(readFileSync(path, 'utf8')).runId).toBe('r1');
    const summary = readFileSync(join(dir, 'summary.txt'), 'utf8');
    expect(summary).toContain('triangles 410000 / 300000 over');
    expect(summary.trim().split('\n').at(-1)).toBe('verdict fail');
  });

  it('refuses to write an invalid report', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gm-report-'));
    expect(() => writeReport(dir, { ...example(), unchecked: [] })).toThrow();
  });
});
