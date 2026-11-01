import { createHash } from 'node:crypto';

import type { TicketProgress } from '@ogm/aiur-client';
import { IsoTime } from '@ogm/contracts';
import type { Sqlite } from '@ogm/db';

import type { AiurClientResolver, ChatJobDirectory } from '../app/registry.js';
import type { LogLine } from '../app/types.js';
import { insertChatRow, lastPhase } from './store.js';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonical(entry)]),
  );
}

function stableEventMessageId(jobId: string, ticket: string, event: unknown): string {
  const hex = createHash('sha256')
    .update(`${jobId}\0${ticket}\0${JSON.stringify(canonical(event))}`)
    .digest('hex')
    .slice(0, 32);
  return `m_${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// aiur progress events and phase changes as `kind: "progress"` system rows. Numeric events dedupe on their aiur id;
// id-less events use a stable content id. Phases dedupe against the job's last stored phase row.
export function ingestProgress(
  sqlite: Sqlite,
  job: { jobId: string; ticket: string },
  progress: Pick<TicketProgress, 'phase' | 'events'>,
  now = new Date(),
): number {
  let inserted = 0;
  const events = progress.events
    .map((event, index) => ({
      event,
      index,
      at: typeof event.at === 'string' ? Date.parse(event.at) : Number.POSITIVE_INFINITY,
      eventId: Number.isInteger(event.id) ? Number(event.id) : Number.POSITIVE_INFINITY,
    }))
    .sort((left, right) => {
      const leftAt = Number.isFinite(left.at) ? left.at : Number.POSITIVE_INFINITY;
      const rightAt = Number.isFinite(right.at) ? right.at : Number.POSITIVE_INFINITY;
      if (leftAt !== rightAt) return leftAt - rightAt;
      if (left.eventId !== right.eventId) return left.eventId - right.eventId;
      return left.index - right.index;
    })
    .map(({ event }) => event);
  for (const event of events) {
    const text = [event.label, event.summary, event.phase, event.transition, event.topic, event.type].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    if (text === undefined) continue;
    const at = IsoTime.safeParse(event.at);
    const eventId = Number.isInteger(event.id) ? Number(event.id) : undefined;
    const topic =
      typeof event.topic === 'string' ? event.topic : typeof event.type === 'string' ? event.type : undefined;
    const result = insertChatRow(sqlite, {
      ...(eventId === undefined ? { id: stableEventMessageId(job.jobId, job.ticket, event) } : {}),
      jobId: job.jobId,
      at: at.success ? at.data : now.toISOString(),
      actor: 'system',
      kind: 'progress',
      text,
      aiur: {
        ticket: job.ticket,
        ...(eventId === undefined ? {} : { eventId }),
        ...(topic === undefined ? {} : { topic }),
      },
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
