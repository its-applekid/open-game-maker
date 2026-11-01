import { appendFileSync } from 'node:fs';

import { CommandError } from './command.js';

/** Activity events (R88): one `{event, job_id, ts, payload}` JSON line appended to `$GM_EVENTS_FILE` when it is set. */
export function makeEmitter(
  file: string | undefined,
  jobId: string | undefined,
): (event: string, payload: unknown, resolvedJobId?: string) => void {
  return (event, payload, resolvedJobId) => {
    if (!file) return;
    const line = { event, job_id: resolvedJobId ?? jobId ?? null, ts: new Date().toISOString(), payload };
    try {
      appendFileSync(file, `${JSON.stringify(line)}\n`);
    } catch (error) {
      throw new CommandError(`cannot append ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
