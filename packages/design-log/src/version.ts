export type VersionCounts = {
  publishCount: number;
  buildsSinceFork: number;
  txSinceLatestBuild: number;
};

export class InvalidVersionCounts extends RangeError {
  constructor() {
    super('version counts must be nonnegative integers');
    this.name = 'InvalidVersionCounts';
  }
}

export function deriveVersion(counts: VersionCounts): string {
  const values = [counts.publishCount, counts.buildsSinceFork, counts.txSinceLatestBuild];
  if (values.some((value) => !Number.isInteger(value) || value < 0)) throw new InvalidVersionCounts();
  return values.join('.');
}
