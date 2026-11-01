type Bucket = { tokens: number; at: number };

/** Per-key token buckets: `perSec` sustained, bursting to `perSec`. */
export class RateTable {
  private readonly buckets = new Map<string, Bucket>();

  allow(key: string, perSec: number, nowMs = Date.now()): boolean {
    const bucket = this.buckets.get(key) ?? { tokens: perSec, at: nowMs };
    bucket.tokens = Math.min(perSec, bucket.tokens + ((nowMs - bucket.at) / 1000) * perSec);
    bucket.at = nowMs;
    this.buckets.set(key, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  /** Drops buckets untouched since `olderThanMs`. */
  prune(olderThanMs: number): void {
    for (const [key, bucket] of this.buckets) if (bucket.at < olderThanMs) this.buckets.delete(key);
  }
}
