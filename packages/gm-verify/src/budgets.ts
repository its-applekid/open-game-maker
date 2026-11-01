import { readFileSync } from 'node:fs';

import type { AssetManifest, Tier } from '@ogm/contracts';
import { z } from 'zod';

import type { BudgetKey, BudgetTuple, VerifyReport } from './report.js';

export type TierBudget = Record<BudgetKey, number>;

const tierBudgetSchema = z.strictObject({
  downloadBytes: z.number().min(0),
  drawCalls: z.number().min(0),
  triangles: z.number().min(0),
  textureBytes: z.number().min(0),
});

/** Calibration overrides are intentionally partial: an operator can replace only the measurements they calibrated. */
export const tierBudgetOverridesSchema = z.strictObject({
  low: tierBudgetSchema.partial().optional(),
  mobile: tierBudgetSchema.partial().optional(),
  desktop: tierBudgetSchema.partial().optional(),
});
export type TierBudgetOverrides = z.infer<typeof tierBudgetOverridesSchema>;

/** Placeholders until calibration on Kevin's devices (A9 §3.5); OGM-063 imports this table. */
export const TIER_BUDGETS: Record<Tier, TierBudget> = {
  low: { downloadBytes: 4_000_000, drawCalls: 150, triangles: 150_000, textureBytes: 64_000_000 },
  mobile: { downloadBytes: 6_000_000, drawCalls: 250, triangles: 300_000, textureBytes: 128_000_000 },
  desktop: { downloadBytes: 25_000_000, drawCalls: 1_000, triangles: 1_500_000, textureBytes: 512_000_000 },
};

export function budgetTuple(actual: number | undefined, limit: number): BudgetTuple {
  if (actual === undefined || !Number.isFinite(actual)) return [0, limit, 'unknown'];
  return [actual, limit, actual > limit ? 'over' : 'ok'];
}

/** Bytes a player on `tier` downloads: each distinct file the tier (or `*`) maps to, counted once. */
export function manifestBytes(manifest: AssetManifest, tier: Tier): number {
  const files = new Set<string>();
  for (const asset of Object.values(manifest.assets)) {
    const name = asset.file[tier] ?? asset.file['*'];
    if (name !== undefined) files.add(name);
  }
  let total = 0;
  for (const name of files) total += manifest.files[name]?.bytes ?? 0;
  return total;
}

export type Measured = { downloadBytes?: number; drawCalls?: number; triangles?: number; textureBytes?: number };

export function readBudgetOverrides(path: string): TierBudgetOverrides {
  return tierBudgetOverridesSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

export function measureBudgets(
  tier: Tier,
  measured: Measured,
  overrides?: TierBudgetOverrides,
): VerifyReport['budgets'] {
  const limit = { ...TIER_BUDGETS[tier], ...overrides?.[tier] };
  return {
    downloadBytes: budgetTuple(measured.downloadBytes, limit.downloadBytes),
    drawCalls: budgetTuple(measured.drawCalls, limit.drawCalls),
    triangles: budgetTuple(measured.triangles, limit.triangles),
    textureBytes: budgetTuple(measured.textureBytes, limit.textureBytes),
  };
}
