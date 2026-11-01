import type { Sqlite } from '@ogm/db';

import type { LogLine } from '../app/types.js';
import type { AiurClientResolver, ChatJobDirectory } from '../app/registry.js';
import { getChatRow, insertChatRow, markMirror, pendingMirrors } from './store.js';

export const MIRROR_FAILED_TEXT = "Your message didn't reach the builder; try again.";

export type MirrorDeps = {
  sqlite: Sqlite;
  jobs: () => ChatJobDirectory | null;
  clientFor: () => AiurClientResolver | null;
  publish: (jobId: string) => void;
  log: (line: LogLine) => void;
  sleep?: (ms: number) => Promise<void>;
  attempts?: number;
};

export interface Mirror {
  // Sends one creator row; resolves once it is sent, failed, or left pending because the job has no ticket yet.
  mirror(id: string): Promise<void>;
  // Sends every pending creator row of the job, oldest first. Called when a job changes (its ticket may now exist).
  flushPending(jobId: string): Promise<void>;
}

const backoff = (attempt: number) => Math.min(1000 * 2 ** attempt, 60_000);
const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms).unref();
  });

// Creator rows are stored before this runs; aiur being down never blocks a post. aiur's `message_id` makes resends safe.
export function createMirror(deps: MirrorDeps): Mirror {
  const sleep = deps.sleep ?? defaultSleep;
  const attempts = deps.attempts ?? 5;
  const inFlight = new Map<string, Promise<void>>();

  async function send(id: string): Promise<void> {
    const row = getChatRow(deps.sqlite, id);
    if (row === null || row.mirrorState !== 'pending' || row.text === null) return;
    const job = await deps.jobs()?.get(row.jobId);
    if (!job?.aiur) return;
    const client = deps.clientFor()?.(job.aiur.daemonSlug);
    if (!client) return;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        await client.message(job.aiur.ticket, row.text, row.id);
        markMirror(deps.sqlite, id, 'sent');
        return;
      } catch (error) {
        deps.log({
          event: 'chat-mirror-error',
          jobId: row.jobId,
          messageId: id,
          attempt,
          error: (error as Error).name,
        });
        if (attempt < attempts - 1) await sleep(backoff(attempt));
      }
    }
    markMirror(deps.sqlite, id, 'failed');
    insertChatRow(deps.sqlite, {
      jobId: row.jobId,
      actor: 'system',
      kind: 'text',
      text: MIRROR_FAILED_TEXT,
      aiur: { ticket: job.aiur.ticket },
    });
    deps.publish(row.jobId);
  }

  function mirror(id: string): Promise<void> {
    const running = inFlight.get(id);
    if (running) return running;
    const task = send(id).finally(() => inFlight.delete(id));
    inFlight.set(id, task);
    return task;
  }

  return {
    mirror,
    async flushPending(jobId) {
      for (const row of pendingMirrors(deps.sqlite, jobId)) await mirror(row.id);
    },
  };
}
