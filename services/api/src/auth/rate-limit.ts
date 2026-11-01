// Fixed one-hour windows held in memory; the API is a single process.
export function createRateLimiter(max: number, windowMs = 60 * 60 * 1000) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string, nowMs = Date.now()): boolean => {
    if (hits.size > 10_000) {
      for (const [stale, { resetAt }] of hits) if (resetAt <= nowMs) hits.delete(stale);
    }
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= nowMs) {
      hits.set(key, { count: 1, resetAt: nowMs + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
}

export function clientIp(headers: Headers): string {
  return headers.get('x-nf-client-connection-ip') ?? headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
}
