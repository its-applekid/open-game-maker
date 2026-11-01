import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { tierSchema, viewIdSchema } from '@ogm/contracts';
import { z } from 'zod';

export const GM_VERIFY_VERSION = '0.1.0';

/** V1 never checks these; every report says so (T10 §4). */
export const ALWAYS_UNCHECKED = ['iPhone Safari', 'sound'] as const;

export const SOFTWARE_RENDERER = /swiftshader|llvmpipe|lavapipe|softpipe|mesa offscreen/i;

export const budgetStatusSchema = z.enum(['ok', 'over', 'unknown']);
export type BudgetStatus = z.infer<typeof budgetStatusSchema>;
/** `[actual, limit, status]`. */
export const budgetTupleSchema = z.tuple([z.number().min(0), z.number().min(0), budgetStatusSchema]);
export type BudgetTuple = z.infer<typeof budgetTupleSchema>;

export const BUDGET_KEYS = ['downloadBytes', 'drawCalls', 'triangles', 'textureBytes'] as const;
export type BudgetKey = (typeof BUDGET_KEYS)[number];

const relativePath = z
  .string()
  .min(1)
  .regex(
    /^(?!\/)(?![A-Za-z]:[\\/])(?!.*(?:^|\/)\.\.(?:\/|$))[^\\]+$/,
    'paths are forward-slash relative paths under --out',
  );

export const viewportSchema = z.enum(['desktop', 'phone']);
export type ViewportName = z.infer<typeof viewportSchema>;

export const consoleEntrySchema = z.object({
  level: z.enum(['error', 'warning']),
  text: z.string(),
  count: z.number().int().min(1),
});
export type ConsoleEntry = z.infer<typeof consoleEntrySchema>;

export const perfSchema = z.object({
  device: z.string(),
  cpu: z.number().min(1),
  firstMs: z.number().min(0),
  cachedMs: z.number().min(0),
  fromNetwork: z.number().int().min(0),
  fromCache: z.number().int().min(0),
  bytesByType: z.record(z.string(), z.object({ n: z.number().int().min(0), bytes: z.number().min(0) })),
  drawCalls: z.number().min(0).optional(),
  triangles: z.number().min(0).optional(),
  textureBytes: z.number().min(0).optional(),
});
export type PerfResult = z.infer<typeof perfSchema>;

/** The verify report (T10 §4, C2): `shots/report.json`, read by the build chat, analytics, repair and evals. */
export const verifyReportSchema = z.object({
  runId: z.string().min(1),
  jobId: z.string().optional(),
  aiurIssue: z.number().int().optional(),
  renderer: z.string().min(1),
  software: z.boolean(),
  viewport: z.enum(['desktop', 'phone', 'both']),
  tier: tierSchema,
  rig: viewIdSchema.optional(),
  frames: z.array(z.object({ t: z.number().min(0), path: relativePath, viewport: viewportSchema.optional() })),
  timeline: relativePath.optional(),
  clip: relativePath.optional(),
  console: z.array(consoleEntrySchema),
  budgets: z.object({
    downloadBytes: budgetTupleSchema,
    drawCalls: budgetTupleSchema,
    triangles: budgetTupleSchema,
    textureBytes: budgetTupleSchema,
  }),
  probes: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
  perf: perfSchema.optional(),
  clients: z.number().int().min(1),
  unchecked: z.array(z.string()).refine((list) => ALWAYS_UNCHECKED.every((item) => list.includes(item)), {
    message: `unchecked must list ${ALWAYS_UNCHECKED.join(' and ')}`,
  }),
  verdict: z.enum(['pass', 'fail', 'error']),
  error: z.string().optional(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  gmVerifyVersion: z.string(),
});
export type VerifyReport = z.infer<typeof verifyReportSchema>;

export const schemas = { 'verify-report.v1': verifyReportSchema } as const;

/**
 * `fail` when any budget is over or the page logged any console error (V1 has no baseline, so every error is new);
 * `error` is set by the runner, never derived.
 */
export function verdictFor(report: Pick<VerifyReport, 'budgets' | 'console'>): 'pass' | 'fail' {
  const over = BUDGET_KEYS.some((key) => report.budgets[key][2] === 'over');
  const errors = report.console.some((entry) => entry.level === 'error');
  return over || errors ? 'fail' : 'pass';
}

export function unknownBudgets(): VerifyReport['budgets'] {
  return {
    downloadBytes: [0, 0, 'unknown'],
    drawCalls: [0, 0, 'unknown'],
    triangles: [0, 0, 'unknown'],
    textureBytes: [0, 0, 'unknown'],
  };
}

export function summaryLines(report: VerifyReport): string[] {
  const lines = [`renderer ${report.renderer}${report.software ? ' (software)' : ''}`];
  for (const key of BUDGET_KEYS) {
    const [actual, limit, status] = report.budgets[key];
    lines.push(`${key} ${actual} / ${limit} ${status}`);
  }
  for (const entry of report.console) lines.push(`console ${entry.level} x${entry.count} ${entry.text}`);
  if (report.error) lines.push(`error ${report.error}`);
  lines.push(`unchecked ${report.unchecked.join(', ')}`);
  lines.push(`verdict ${report.verdict}`);
  return lines;
}

/**
 * Validates, then writes `summary.txt` (one line per budget) and `report.json` into `outDir`. The report lands last and
 * by rename, so a queue poller never reads half a file.
 */
export function writeReport(outDir: string, report: VerifyReport): string {
  const parsed = verifyReportSchema.parse(report);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'summary.txt'), `${summaryLines(parsed).join('\n')}\n`);
  const path = join(outDir, 'report.json');
  writeFileSync(`${path}.tmp`, `${JSON.stringify(parsed, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
  return path;
}
