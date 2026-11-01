// Fixed one-hour windows held in memory; the API is a single process.
export function createRateLimiter(max: number, windowMs = 60 * 60 * 1000, maxKeys = 10_000) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string, nowMs = Date.now()): boolean => {
    if (key.length > 320) return false;

    const entry = hits.get(key);
    if (entry && entry.resetAt > nowMs) {
      entry.count += 1;
      return entry.count <= max;
    }

    if (entry) hits.delete(key);
    if (hits.size >= maxKeys) {
      for (const [stale, { resetAt }] of hits) if (resetAt <= nowMs) hits.delete(stale);
      if (hits.size >= maxKeys) return false;
    }

    hits.set(key, { count: 1, resetAt: nowMs + windowMs });
    return true;
  };
}

export function clientIp(headers: Headers): string {
  return headers.get('x-nf-client-connection-ip') ?? headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
}
