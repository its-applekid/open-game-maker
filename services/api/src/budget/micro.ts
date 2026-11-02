const USD = /^(?:0|[1-9][0-9]*)(?:\.([0-9]{1,6}))?$/;
const MICRO_PER_USD = 1_000_000n;

export function usdToMicro(value: string): bigint {
  const match = USD.exec(value);
  if (!match) throw new TypeError('USD must be a non-negative decimal string with at most 6 fraction digits');
  const [whole] = value.split('.', 1);
  const fraction = (match[1] ?? '').padEnd(6, '0');
  return BigInt(whole!) * MICRO_PER_USD + BigInt(fraction || '0');
}

export function microToUsd(value: bigint): string {
  if (value < 0n) throw new TypeError('micro-dollars must be non-negative');
  return `${value / MICRO_PER_USD}.${String(value % MICRO_PER_USD).padStart(6, '0')}`;
}

export function safeMicro(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('micro-dollar amount exceeds safe integer range');
  return Number(value);
}
