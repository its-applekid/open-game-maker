import { z } from 'zod';

export const checkResultSchema = z.strictObject({
  id: z.string().regex(/^C(0|[1-9]|1[01])$/),
  name: z.string().min(1),
  status: z.enum(['pass', 'fail', 'unchecked']),
  detail: z.string(),
  artifacts: z.array(z.string()).optional(),
});

/** `conformance.json`, owned by OGM-029 and read by OGM-093; additive changes only. */
export const conformanceReportSchema = z.strictObject({
  sdkProtocol: z.number().int().min(1),
  renderer: z.string(),
  gl: z.enum(['gpu', 'software']),
  game: z.strictObject({ dir: z.string(), manifestId: z.string() }),
  checks: z.array(checkResultSchema),
  stills: z.array(z.string()),
  startedAt: z.string(),
  durationMs: z.number().min(0),
});
export type ConformanceReport = z.infer<typeof conformanceReportSchema>;

export function reportFailed(report: Pick<ConformanceReport, 'checks'>): boolean {
  return report.checks.some((check) => check.status === 'fail');
}

/** One line per check, then the renderer: `C6  pause-halts  pass  tick frozen …`. */
export function formatReport(report: ConformanceReport): string[] {
  const width = Math.max(...report.checks.map((check) => check.name.length));
  return [
    ...report.checks.map(
      (check) => `${check.id.padEnd(4)}${check.name.padEnd(width + 2)}${check.status.padEnd(11)}${check.detail}`,
    ),
    `renderer: ${report.renderer} (${report.gl})`,
  ];
}
