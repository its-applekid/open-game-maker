import type { TicketProgress } from '@ogm/aiur-client';
import { IsoTime } from '@ogm/contracts';
import type { Sqlite } from '@ogm/db';

import type { AiurClientResolver, ChatJobDirectory } from '../app/registry.js';
import type { LogLine } from '../app/types.js';
import { insertChatRow, lastPhase } from './store.js';

// aiur progress events and phase changes as `kind: "progress"` system rows. Events dedupe on (job, aiur event id),
// phases against the job's last stored phase row. OGM-032's feed subscriber calls this too and retires the timer.
export function ingestProgress(
  sqlite: Sqlite,
  job: { jobId: string; ticket: string },
  progress: Pick<TicketProgress, 'phase' | 'events'>,
  now = new Date(),
): number {
  let inserted = 0;
  const events = progress.events
    .filter((event): event is typeof event & { id: number } => Number.isInteger(event.id))
    .sort((a, b) => a.id - b.id);
  for (const event of events) {
    const text = [event.label, event.summary, event.topic, event.type].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    if (text === undefined) continue;
    const at = IsoTime.safeParse(event.at);
    const topic =
      typeof event.topic === 'string' ? event.topic : typeof event.type === 'string' ? event.type : undefined;
    const result = insertChatRow(sqlite, {
      jobId: job.jobId,
      at: at.success ? at.data : now.toISOString(),
      actor: 'system',
      kind: 'progress',
      text,
      aiur: { ticket: job.ticket, eventId: event.id, ...(topic === undefined ? {} : { topic }) },
    });
    if (result.inserted) inserted += 1;
  }

  const phase = progress.phase.status === 'known' ? progress.phase.value : null;
  if (phase && lastPhase(sqlite, job.jobId) !== phase) {
    insertChatRow(sqlite, {
      jobId: job.jobId,
      at: now.toISOString(),
      actor: 'system',
      kind: 'progress',
      text: phase,
      aiur: { ticket: job.ticket, topic: 'phase' },
    });
    inserted += 1;
  }
  return inserted;
}

export type PollerDeps = {
  sqlite: Sqlite;
  jobs: () => ChatJobDirectory | null;
  clientFor: () => AiurClientResolver | null;
  publish: (jobId: string) => void;
  log: (line: LogLine) => void;
  // Each tick also retries the creator rows still waiting for a ticket or a reachable daemon.
  flushPending?: (jobId: string) => Promise<void>;
};

export function createProgressPoller(deps: PollerDeps) {
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const directory = deps.jobs();
      const resolveClient = deps.clientFor();
      if (!directory || !resolveClient) return;
      for (const job of await directory.active()) {
        if (!job.aiur) continue;
        const client = resolveClient(job.aiur.daemonSlug);
        if (!client) continue;
        try {
          const progress = await client.progress(job.aiur.ticket, 20);
          if (ingestProgress(deps.sqlite, { jobId: job.jobId, ticket: job.aiur.ticket }, progress) > 0) {
            deps.publish(job.jobId);
          }
        } catch (error) {
          deps.log({ event: 'chat-progress-error', jobId: job.jobId, error: (error as Error).name });
        }
        void deps.flushPending?.(job.jobId).catch((error: unknown) => {
          deps.log({ event: 'chat-mirror-error', jobId: job.jobId, error: (error as Error).name });
        });
      }
    } catch (error) {
      deps.log({ event: 'chat-progress-error', error: (error as Error).name });
    } finally {
      running = false;
    }
  }

  return {
    tick,
    start(intervalMs: number) {
      if (timer) return;
      timer = setInterval(() => void tick(), intervalMs);
      timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
