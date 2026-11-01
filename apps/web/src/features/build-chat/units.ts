const MICRO_USD_PER_UNIT = 1_000_000;

export function formatUnits(microUsd: number, unitLabel: string): string {
  const unit = singular(unitLabel);
  const value = Math.max(0, microUsd) / MICRO_USD_PER_UNIT;
  const label = value === 1 ? unit : plural(unit);

  return `${formatValue(value)} ${label}`;
}

export function formatUsage(usedMicroUsd: number, totalMicroUsd: number, unitLabel: string): string {
  return `${formatValue(Math.max(0, usedMicroUsd) / MICRO_USD_PER_UNIT)} of ${formatUnits(totalMicroUsd, unitLabel)}`;
}

function formatValue(value: number): string {
  const precision = value >= 0.1 ? 1 : 4;
  const threshold = 10 ** -precision;
  if (value > 0 && value < threshold) return `<${threshold.toFixed(precision)}`;
  return value.toFixed(precision).replace(/\.0+$|(?<=\.[0-9]*[1-9])0+$/u, '');
}

function singular(label: string): string {
  const trimmed = label.trim() || 'unit';
  return trimmed.endsWith('s') ? trimmed.slice(0, -1) : trimmed;
}

function plural(label: string): string {
  return label.endsWith('s') ? label : `${label}s`;
}
