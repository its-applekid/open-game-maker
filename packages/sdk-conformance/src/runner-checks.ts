import { CHECKS } from './checks/index.js';
import { message } from './checks/util.js';
import type { Check, CheckContext, CheckResult } from './types.js';

/** A page that never answers would otherwise hold the host-wide capture slot forever. */
export const CHECK_TIMEOUT_MS = 180_000;

/** Runs each check in order; a check that throws or times out is a `fail` with the error, never a skipped pass. */
export async function runChecks(
  ctx: CheckContext,
  checks: Check[] = CHECKS,
  timeoutMs = CHECK_TIMEOUT_MS,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const check of checks) {
    let outcome: Omit<CheckResult, 'id' | 'name'>;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs);
    });
    try {
      outcome = await Promise.race([check.run(ctx), deadline]);
    } catch (error) {
      outcome = { status: 'fail', detail: `check crashed: ${message(error)}` };
    } finally {
      clearTimeout(timer);
    }
    results.push({ id: check.id, name: check.name, ...outcome });
  }
  return results;
}

/** Boot failed: `C0` carries the reason and every check is `unchecked`, never `pass`. */
export function bootFailedResults(detail: string, checks: Check[] = CHECKS): CheckResult[] {
  return [
    { id: 'C0', name: 'boot', status: 'fail', detail },
    ...checks.map((check) => ({
      id: check.id,
      name: check.name,
      status: 'unchecked' as const,
      detail: 'boot-failed',
    })),
  ];
}
