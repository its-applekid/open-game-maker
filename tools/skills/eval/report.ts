import { compareM6 } from './m6.js';
import type { EvalConfigName, EvalRun, Thresholds } from './types.js';

const configs: EvalConfigName[] = ['with_skill', 'baseline', 'full_reference'];

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function ratio(run: EvalRun): number {
  return run.m5.total === 0 ? 0 : run.m5.equalToCardExample / run.m5.total;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function gates(run: EvalRun): string {
  return `${run.gates.check ? '✓' : '✗'} check / ${run.gates.test ? '✓' : '✗'} test / ${run.gates.run === 'pass' ? '✓' : run.gates.run === 'fail' ? '✗' : '!'} run`;
}

function m6Lines(runs: EvalRun[]): string[] {
  if (runs.length < 2) return ['- M6 variety: needs at least 2 games.'];
  const result = compareM6(runs);
  const lines = [`- M6 variety: ${result.passed ? 'pass' : 'fail'}.`];
  for (const briefs of result.adapterCollisions) lines.push(`  - Identical adapter calls: ${briefs.join(', ')}.`);
  for (const briefs of result.renderKeyCollisions) lines.push(`  - Identical render keys: ${briefs.join(', ')}.`);
  return lines;
}

function configSection(config: EvalConfigName, runs: EvalRun[]): string[] {
  const lines = [
    `## ${config}`,
    '',
    '| Brief | Gates | Time | Tokens | M1 | M4 | M5 | Result |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const run of runs) {
    const tokens = run.tokens ? `${run.tokens.input}/${run.tokens.output}` : '—';
    lines.push(
      `| ${escapeCell(run.brief)} | ${gates(run)} | ${(run.durationMs / 1000).toFixed(1)}s | ${tokens} | ${run.m1.duplicatedPct.toFixed(2)}% | ${run.m4.unasked.length} | ${run.m5.equalToCardExample}/${run.m5.total} | ${run.passed ? 'pass' : 'fail'} |`,
    );
  }
  const passed = runs.filter((run) => run.passed).length;
  lines.push(
    '',
    `Summary: ${passed}/${runs.length} passed (${percent(runs.length === 0 ? 0 : passed / runs.length)}); mean M1 ${mean(runs.map((run) => run.m1.duplicatedPct)).toFixed(2)}%; total M4 ${runs.reduce((sum, run) => sum + run.m4.unasked.length, 0)}; mean M5 ${percent(mean(runs.map(ratio)))}.`,
    ...m6Lines(runs),
    '',
  );
  return lines;
}

function passRate(runs: EvalRun[]): number {
  return runs.length === 0 ? 0 : runs.filter((run) => run.passed).length / runs.length;
}

function shipGate(runs: EvalRun[], thresholds: Thresholds, previous?: EvalRun[]): string[] {
  const selectedGroups = configs
    .map((config) => runs.filter((run) => run.config === config))
    .filter((group) => group.length > 0);
  const m6Status = selectedGroups.some((group) => group.length < 2)
    ? 'incomplete'
    : selectedGroups.every((group) => compareM6(group).passed)
      ? 'pass'
      : 'fail';
  const checks = [
    `- Pass rate: ${previous ? (passRate(runs) >= passRate(previous) ? 'pass' : 'fail') : 'no baseline'}.`,
    `- M1 below ${thresholds.m1Pct}%: ${runs.every((run) => run.m1.duplicatedPct < thresholds.m1Pct) ? 'pass' : 'fail'}.`,
    `- M4 zero: ${runs.every((run) => run.m4.unasked.length === 0) ? 'pass' : 'fail'}.`,
    `- M5 under half: ${runs.every((run) => run.m5.total === 0 || ratio(run) < 0.5) ? 'pass' : 'fail'}.`,
    `- M6 distinct signatures: ${m6Status}.`,
  ];
  if (!previous) checks.unshift('No previous baseline is available; the pass-rate comparison is informational.');
  return ['## Ship gate', '', ...checks, ''];
}

function identicalMetricWarnings(runs: EvalRun[]): string[] {
  if (runs.length < 2) return [];
  const metrics = [
    ['M1', runs.map((run) => run.m1.duplicatedPct)],
    ['M4', runs.map((run) => run.m4.unasked.length)],
    ['M5', runs.map(ratio)],
  ] as const;
  const warnings = metrics
    .filter(([, values]) => new Set(values).size === 1)
    .map(([name]) => `- ${name} has the same value in every run.`);
  return warnings.length === 0 ? [] : ['## Non-discriminating metrics', '', ...warnings, ''];
}

export function renderBenchmark(runs: EvalRun[], thresholds: Thresholds, previous?: EvalRun[]): string {
  const lines = [
    '# Skill sameness benchmark',
    '',
    `Generated from ${runs.length} run${runs.length === 1 ? '' : 's'}. Tokens are input/output when the agent CLI reports them.`,
    '',
  ];
  for (const config of configs) {
    const selected = runs.filter((run) => run.config === config);
    if (selected.length > 0) lines.push(...configSection(config, selected));
  }
  lines.push(...shipGate(runs, thresholds, previous), ...identicalMetricWarnings(runs));
  return `${lines.join('\n').trimEnd()}\n`;
}
