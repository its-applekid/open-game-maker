import type { Sqlite } from '@ogm/db';

import type { LogLine } from '../app/types.js';
import type { AiurClientResolver, ChatJobDirectory } from '../app/registry.js';
import { getChatRow, insertChatRow, markMirror, pendingMirrors, type MediaSigner } from './store.js';

export const MIRROR_FAILED_TEXT = "Your message didn't reach the builder; try again.";

export type MirrorDeps = {
  sqlite: Sqlite;
  jobs: () => ChatJobDirectory | null;
  clientFor: () => AiurClientResolver | null;
  sign: MediaSigner;
  publish: (jobId: string) => void;
  log: (line: LogLine) => void;
  sleep?: (ms: number) => Promise<void>;
  attempts?: number;
  requestTimeoutMs?: number;
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
  const requestTimeoutMs = deps.requestTimeoutMs ?? 15_000;
  const drains = new Map<string, Promise<void>>();

  async function send(id: string): Promise<void> {
    const row = getChatRow(deps.sqlite, id);
    if (row === null || row.mirrorState !== 'pending') return;
    const job = await deps.jobs()?.get(row.jobId);
    if (!job?.aiur) return;
    const resolveClient = deps.clientFor();
    if (!resolveClient) return;
    const client = await resolveClient(job.aiur.daemonSlug);
    if (!client) return;
    const message =
      row.text ??
      (row.kind === 'image' && row.mediaHash !== null
        ? `Creator attached an image: ${await deps.sign(row.mediaHash)}`
        : null);
    if (message === null) return;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        await client.message(job.aiur.ticket, message, row.id, AbortSignal.timeout(requestTimeoutMs));
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
    const row = getChatRow(deps.sqlite, id);
    return row === null ? Promise.resolve() : flushPending(row.jobId);
  }

  function flushPending(jobId: string): Promise<void> {
    const previous = drains.get(jobId) ?? Promise.resolve();
    const task = previous
      .catch(() => {})
      .then(async () => {
        for (const row of pendingMirrors(deps.sqlite, jobId)) await send(row.id);
      });
    const tracked = task.finally(() => {
      if (drains.get(jobId) === tracked) drains.delete(jobId);
    });
    drains.set(jobId, tracked);
    return tracked;
  }

  return {
    mirror,
    flushPending,
  };
}
