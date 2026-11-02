import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { conformanceReportSchema, formatReport, reportFailed } from '../src/report.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/conformance.report.v1.json', import.meta.url), 'utf8'));

describe('conformance.json', () => {
  it('accepts the recorded 2D template report: 11 checks and the renderer string', () => {
    const report = conformanceReportSchema.parse(fixture);
    expect(report.checks.map((check) => check.id)).toEqual([
      'C1',
      'C2',
      'C3',
      'C4',
      'C5',
      'C6',
      'C7',
      'C8',
      'C9',
      'C10',
      'C11',
    ]);
    expect(report.renderer).toMatch(/ANGLE \(Intel/);
    expect(reportFailed(report)).toBe(false);
  });

  it('rejects a report without a renderer, so a SwiftShader run is never mistaken for a GPU one', () => {
    const rest = { ...fixture };
    delete rest.renderer;
    expect(conformanceReportSchema.safeParse(rest).success).toBe(false);
  });

  it('prints one line per check and the renderer', () => {
    const lines = formatReport(conformanceReportSchema.parse(fixture));
    expect(lines).toHaveLength(12);
    expect(lines[5]).toMatch(/^C6\s+pause-halts\s+pass\s+tick frozen/);
    expect(lines.at(-1)).toMatch(/^renderer: ANGLE \(Intel.*\(gpu\)$/);
  });
});
