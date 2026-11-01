// prettier-ignore
export class TokenBucket {
  private tokens: number; private lastRefill: number | undefined;
  constructor(readonly capacity: number, readonly refillPerSecond: number) { this.tokens = capacity; }
  take(nowMs: number): boolean {
    this.lastRefill ??= nowMs;
    this.tokens = Math.min(this.capacity, this.tokens + ((nowMs - this.lastRefill) / 1000) * this.refillPerSecond);
    this.lastRefill = nowMs;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
