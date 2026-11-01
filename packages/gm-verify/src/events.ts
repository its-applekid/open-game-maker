import { appendFileSync } from 'node:fs';

export type ActivityContext = {
  eventsFile?: string;
  jobId?: string;
  aiurIssue?: number;
  aiurRunId?: string;
  source?: 'gm run' | 'skill:gm-verify';
};

/** T10 §4 activity event: one JSON line per phase in `$GM_EVENTS_FILE`. */
export function playtesting(context: ActivityContext, phase: 'start' | 'end'): void {
  if (!context.eventsFile) return;
  const event = {
    jobId: context.jobId,
    aiurIssue: context.aiurIssue,
    aiurRunId: context.aiurRunId,
    activity: 'playtesting',
    source: context.source ?? 'gm run',
    phase,
    at: new Date().toISOString(),
  };
  appendFileSync(context.eventsFile, `${JSON.stringify(event)}\n`);
}
