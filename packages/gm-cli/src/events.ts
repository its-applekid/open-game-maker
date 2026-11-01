import { appendFileSync } from 'node:fs';

/** Activity events (R88): one `{event, job_id, ts, payload}` JSON line appended to `$GM_EVENTS_FILE` when it is set. */
export function makeEmitter(
  file: string | undefined,
  jobId: string | undefined,
): (event: string, payload: unknown) => void {
  return (event, payload) => {
    if (!file) return;
    const line = { event, job_id: jobId ?? null, ts: new Date().toISOString(), payload };
    appendFileSync(file, `${JSON.stringify(line)}\n`);
  };
}
