export const START_POLL_MS = 10_000;
export const RUNNING_POLL_MS = 60_000;
export const READY_TIMEOUT_MS = 120_000;
export const MISSES_BEFORE_RESTART = 3;
export const MISSES_BEFORE_STOP = 6;

export type Sleep = (ms: number) => Promise<void>;
export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Polls every START_POLL_MS until the check passes or READY_TIMEOUT_MS has elapsed; a thrown check is a miss.
export async function waitHealthy(check: () => Promise<boolean>, sleep: Sleep): Promise<boolean> {
  for (let waited = 0; ; waited += START_POLL_MS) {
    if (await passes(check)) return true;
    if (waited >= READY_TIMEOUT_MS) return false;
    await sleep(START_POLL_MS);
  }
}

export async function passes(check: () => Promise<boolean>): Promise<boolean> {
  try {
    return await check();
  } catch {
    return false;
  }
}

export type HealthVerdict = 'ok' | 'miss' | 'restart' | 'stop';

// Counts consecutive misses per daemon for the RUNNING_POLL_MS monitor.
export function createMissCounter() {
  const misses = new Map<string, number>();
  return {
    record(slug: string, healthy: boolean): HealthVerdict {
      if (healthy) {
        misses.delete(slug);
        return 'ok';
      }
      const count = (misses.get(slug) ?? 0) + 1;
      misses.set(slug, count);
      if (count >= MISSES_BEFORE_STOP) {
        misses.delete(slug);
        return 'stop';
      }
      return count === MISSES_BEFORE_RESTART ? 'restart' : 'miss';
    },
    reset(slug: string) {
      misses.delete(slug);
    },
  };
}
