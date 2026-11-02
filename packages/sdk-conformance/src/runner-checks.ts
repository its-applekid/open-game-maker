import { CHECKS } from './checks/index.js';
import { message } from './checks/util.js';
import type { Check, CheckContext, CheckResult } from './types.js';

/** Runs each check in order; a check that throws is a `fail` with the error, never a skipped pass. */
export async function runChecks(ctx: CheckContext, checks: Check[] = CHECKS): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const check of checks) {
    let outcome: Omit<CheckResult, 'id' | 'name'>;
    try {
      outcome = await check.run(ctx);
    } catch (error) {
      outcome = { status: 'fail', detail: `check crashed: ${message(error)}` };
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
