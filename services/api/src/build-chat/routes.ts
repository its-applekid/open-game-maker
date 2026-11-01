import type { Context } from 'hono';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import { ChatPostBody, ChatSinceQuery, type ChatMessagesPage } from '@ogm/contracts';
import { authorize, type Action } from '@ogm/policy';

import { actorFromPrincipal, requireAuthorization } from '../accounts/families.js';
import { HttpError } from '../app/errors.js';
import { requirePrincipal } from '../app/principal.js';
import type { ChatJob } from '../app/registry.js';
import type { ApiBindings, AppDeps } from '../app/types.js';
import { parseBody, parseQuery } from '../app/validate.js';
import { createMirror, type Mirror } from './aiur-mirror.js';
import { mediaSigner } from './media.js';
import { loadOutboxHandlers } from './outbox-handlers.js';
import { createOutboxRelay } from './outbox-relay.js';
import { createProgressPoller } from './progress-poller.js';
import { insertChatRow, listSince, toMessage, type MediaSigner } from './store.js';
import { createChatHub, formatChatFrame, type ChatHub } from './stream.js';

export const prefix = '/api/v1/jobs';

const POSTS_PER_MINUTE = 30;

type ChatRuntime = { hub: ChatHub; mirror: Mirror; sign: MediaSigner; posts: Map<string, number[]> };
const runtimes = new WeakMap<AppDeps, ChatRuntime>();

export function getChatRuntime(deps: AppDeps): ChatRuntime {
  const runtime = runtimes.get(deps);
  if (!runtime) throw new Error('build chat context was not set up');
  return runtime;
}

// The relay and poller start only when configured: a workspaces root for the relay, a period for the poller.
export function setup(deps: AppDeps): void {
  if (runtimes.has(deps)) return;
  const hub = createChatHub();
  const publish = (jobId: string) => hub.publish(jobId);
  const jobs = () => deps.registry.chatJobs;
  const clientFor = () => deps.registry.aiurClientFor;
  const mirror = createMirror({ sqlite: deps.sqlite, jobs, clientFor, publish, log: deps.log });
  runtimes.set(deps, { hub, mirror, sign: mediaSigner(deps.blobStore), posts: new Map() });

  const flush = (jobId: string) =>
    mirror.flushPending(jobId).catch((error: unknown) => {
      deps.log({ event: 'chat-mirror-error', jobId, error: (error as Error).name });
    });
  deps.events.on('job.changed', ({ jobId }) => void flush(jobId));

  if (deps.config.chatPollMs !== undefined) {
    createProgressPoller({ sqlite: deps.sqlite, jobs, clientFor, publish, log: deps.log, flushPending: flush }).start(
      deps.config.chatPollMs,
    );
  }

  const root = deps.config.builderWorkspacesRoot;
  if (root === undefined) {
    deps.log({ event: 'chat-relay-disabled', missing: 'OGM_BUILDER_WORKSPACES_ROOT' });
    return;
  }
  void loadOutboxHandlers()
    .then((handlers) => {
      createOutboxRelay({
        root,
        sqlite: deps.sqlite,
        handlers,
        jobs,
        log: deps.log,
        context: (jobId, workspaceRoot) => ({
          jobId,
          workspaceRoot,
          sqlite: deps.sqlite,
          blobStore: deps.blobStore,
          publish,
          log: deps.log,
        }),
      }).start();
    })
    .catch((error: unknown) => deps.log({ event: 'outbox-relay-error', stack: (error as Error).stack }));
}

// Reading needs the owner (`game.edit`; players never read a build chat); posting needs `job.create` on the job's game.
async function authorizedJob(c: Context<ApiBindings>, action: Action): Promise<ChatJob> {
  const principal = requirePrincipal(c, ['user']);
  const job = await c.get('deps').registry.chatJobs?.get(c.req.param('jobId') ?? '');
  if (!job) throw new HttpError(404, 'job_not_found');
  requireAuthorization(
    authorize(actorFromPrincipal(principal), action, {
      gameId: job.gameId,
      familyId: job.familyId,
      ownerId: job.ownerId,
    }),
  );
  return job;
}

// `?since=` wins; otherwise a reconnecting EventSource's Last-Event-ID.
function sinceOf(c: Context<ApiBindings>): number {
  const { since } = parseQuery(c, ChatSinceQuery);
  if (c.req.query('since') !== undefined) return since;
  const lastId = c.req.header('last-event-id');
  return lastId !== undefined && /^[0-9]{1,15}$/.test(lastId) ? Number(lastId) : since;
}

function allowPost(runtime: ChatRuntime, jobId: string, now = Date.now()): boolean {
  const recent = (runtime.posts.get(jobId) ?? []).filter((at) => now - at < 60_000);
  if (recent.length >= POSTS_PER_MINUTE) {
    runtime.posts.set(jobId, recent);
    return false;
  }
  recent.push(now);
  runtime.posts.set(jobId, recent);
  return true;
}

function chatStream(c: Context<ApiBindings>, job: ChatJob, since: number) {
  const deps = c.get('deps');
  const runtime = getChatRuntime(deps);
  if (!runtime.hub.canSubscribe(job.jobId)) throw new HttpError(503, 'too_many_streams');

  return streamSSE(c, async (stream) => {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let cursor = since;
    let chain = Promise.resolve();
    // Serial: each pass drains every row past the cursor, so wake-ups never reorder or repeat rows.
    const pump = () => {
      chain = chain
        .then(async () => {
          for (;;) {
            const rows = listSince(deps.sqlite, job.jobId, cursor);
            if (rows.length === 0) return;
            for (const row of rows) {
              await stream.write(formatChatFrame(row.seq, await toMessage(row, runtime.sign)));
              cursor = row.seq;
            }
          }
        })
        .catch(finish);
    };

    const unsubscribe = runtime.hub.subscribe(job.jobId, pump);
    stream.onAbort(finish);
    const keepalive = setInterval(() => {
      void stream.write(': ping\n\n').catch(finish);
    }, 25_000);
    keepalive.unref();
    pump();

    try {
      await finished;
    } finally {
      clearInterval(keepalive);
      unsubscribe();
    }
  });
}

export default new Hono<ApiBindings>()
  .get('/:jobId/chat', async (c) => {
    const job = await authorizedJob(c, 'game.edit');
    return chatStream(c, job, sinceOf(c));
  })
  .get('/:jobId/chat/messages', async (c) => {
    const job = await authorizedJob(c, 'game.edit');
    const since = sinceOf(c);
    const { sign } = getChatRuntime(c.get('deps'));
    const rows = listSince(c.get('deps').sqlite, job.jobId, since);
    const page: ChatMessagesPage = {
      messages: await Promise.all(rows.map((row) => toMessage(row, sign))),
      last_seq: rows.at(-1)?.seq ?? since,
    };
    return c.json(page);
  })
  .post('/:jobId/chat', async (c) => {
    const job = await authorizedJob(c, 'job.create');
    const body = await parseBody(c, ChatPostBody);
    const deps = c.get('deps');
    const runtime = getChatRuntime(deps);
    if (!allowPost(runtime, job.jobId)) throw new HttpError(429, 'rate_limited');

    const { row } = insertChatRow(deps.sqlite, {
      jobId: job.jobId,
      actor: 'creator',
      kind: 'text',
      text: body.text,
      mirrorState: 'pending',
      ...(job.aiur ? { aiur: { ticket: job.aiur.ticket } } : {}),
    });
    runtime.hub.publish(job.jobId);
    void runtime.mirror.mirror(row!.id).catch((error: unknown) => {
      deps.log({ event: 'chat-mirror-error', jobId: job.jobId, error: (error as Error).name });
    });
    return c.json(await toMessage(row!, runtime.sign), 201);
  });
