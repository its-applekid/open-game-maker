export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;

export function fetchWithTimeout(fetchImpl: typeof fetch, timeoutMs: number = DEFAULT_HTTP_TIMEOUT_MS): typeof fetch {
  return (input, init = {}) =>
    fetchImpl(input, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });
}
