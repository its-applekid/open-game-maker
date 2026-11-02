import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { manifestBytes, measureBudgets, readBudgetOverrides, TIER_BUDGETS } from '../src/budgets.js';

describe('measureBudgets', () => {
  it('marks 410k triangles over on mobile but ok on desktop', () => {
    expect(measureBudgets('mobile', { triangles: 410_000 }).triangles).toEqual([410_000, 300_000, 'over']);
    expect(measureBudgets('desktop', { triangles: 410_000 }).triangles).toEqual([410_000, 1_500_000, 'ok']);
  });

  it('is ok exactly at the limit', () => {
    expect(measureBudgets('low', { drawCalls: TIER_BUDGETS.low.drawCalls }).drawCalls[2]).toBe('ok');
  });

  it('reports unknown, not ok, for anything it could not measure', () => {
    const budgets = measureBudgets('mobile', { drawCalls: 10 });
    expect(budgets.downloadBytes).toEqual([0, 6_000_000, 'unknown']);
    expect(budgets.drawCalls[2]).toBe('ok');
  });

  it('applies validated per-tier calibration overrides', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gm-budgets-'));
    const path = join(dir, 'budgets.json');
    writeFileSync(path, JSON.stringify({ mobile: { triangles: 500_000 } }));
    const overrides = readBudgetOverrides(path);
    expect(measureBudgets('mobile', { triangles: 410_000 }, overrides).triangles).toEqual([410_000, 500_000, 'ok']);
    expect(measureBudgets('mobile', { drawCalls: 1 }, overrides).drawCalls[1]).toBe(TIER_BUDGETS.mobile.drawCalls);
  });

  it('rejects unknown calibration keys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gm-budgets-'));
    const path = join(dir, 'budgets.json');
    writeFileSync(path, JSON.stringify({ mobile: { triangles: 500_000, surprise: 1 } }));
    expect(() => readBudgetOverrides(path)).toThrow();
  });
});

describe('manifestBytes', () => {
  it("counts each of the tier's files once, falling back to *", () => {
    const manifest = {
      version: 1 as const,
      tiers: ['mobile' as const, 'desktop' as const],
      files: {
        'orc-m.glb': { bytes: 100, decoders: [] },
        'orc-d.glb': { bytes: 900, decoders: [] },
        'wall.glb': { bytes: 50, decoders: [] },
      },
      assets: {
        orc: { file: { mobile: 'orc-m.glb', desktop: 'orc-d.glb' }, license: { id: 'CC0', use: 'any' as const } },
        orc2: { file: { mobile: 'orc-m.glb' }, license: { id: 'CC0', use: 'any' as const } },
        wall: { file: { '*': 'wall.glb' }, license: { id: 'CC0', use: 'any' as const } },
      },
    };
    expect(manifestBytes(manifest, 'mobile')).toBe(150);
    expect(manifestBytes(manifest, 'desktop')).toBe(950);
  });
});
