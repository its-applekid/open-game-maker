import { Hono } from 'hono';
import { z } from 'zod';

import { AiurHttpError, type Decision } from '@ogm/aiur-client';
import { HttpError } from '../app/errors.js';
import type { ApiBindings, AppDeps } from '../app/types.js';
import { parseBody } from '../app/validate.js';
import { authorizedChatJob } from '../build-chat/authorization.js';
import { getChatRuntime } from '../build-chat/routes.js';
import { findCheckpoint, parseCheckpoint, updateCheckpoint } from '../build-chat/store.js';
import { checkpointBudget } from './budget.js';
import { answeredOption, statusOf } from './correlate.js';
import { recordSupervisorTokenStatus } from './health.js';
import { createInboxWriter, type InboxWriter } from './inbox.js';
import { createCheckpointPoller } from './poller.js';

export const prefix = '/api/v1/jobs';
const ANSWERS_PER_MINUTE = 10;
const AnswerBody = z.object({ option_id: z.string().regex(/^[a-z0-9_-]{1,32}$/) }).strict();

type CheckpointRuntime = { inbox: InboxWriter; answers: Map<string, number[]> };
const runtimes = new WeakMap<AppDeps, CheckpointRuntime>();

export function setup(deps: AppDeps): void {
  if (runtimes.has(deps)) return;
  const inbox = createInboxWriter({ sqlite: deps.sqlite, log: deps.log });
  const runtime = { inbox, answers: new Map<string, number[]>() };
  runtimes.set(deps, runtime);
  if (deps.config.checkpointPollMs !== undefined) {
    createCheckpointPoller({
      sqlite: deps.sqlite,
      jobs: () => deps.registry.chatJobs,
      clientFor: () => deps.registry.aiurClientFor,
      inbox,
      publish: (jobId) => getChatRuntime(deps).hub.publish(jobId),
      log: deps.log,
      supervisorTokenStatus: (daemon, missing) => recordSupervisorTokenStatus(deps, daemon, missing),
    }).start(deps.config.checkpointPollMs);
  }
}

function runtimeFor(deps: AppDeps): CheckpointRuntime {
  const runtime = runtimes.get(deps);
  if (!runtime) throw new Error('checkpoint context was not set up');
  return runtime;
}

function allowAnswer(runtime: CheckpointRuntime, jobId: string, now = Date.now()): boolean {
  const recent = (runtime.answers.get(jobId) ?? []).filter((at) => now - at < 60_000);
  if (recent.length >= ANSWERS_PER_MINUTE) {
    runtime.answers.set(jobId, recent);
    return false;
  }
  recent.push(now);
  runtime.answers.set(jobId, recent);
  return true;
}

function winnerPatch(decision: Decision) {
  const status = statusOf(decision);
  const optionId = answeredOption(decision);
  return {
    version: decision.version,
    status,
    ...(optionId === undefined ? {} : { option_id: optionId }),
  };
}

export default new Hono<ApiBindings>()
  .get('/:jobId/checkpoints/budget', async (c) => {
    const job = await authorizedChatJob(c, 'game.edit', true);
    return c.json(checkpointBudget(c.get('deps').sqlite, job.jobId, job.kind));
  })
  .post('/:jobId/checkpoints/:checkpointId/answer', async (c) => {
    const job = await authorizedChatJob(c, 'job.create', true);
    const deps = c.get('deps');
    const runtime = runtimeFor(deps);
    if (!allowAnswer(runtime, job.jobId)) throw new HttpError(429, 'rate_limited');
    const { option_id } = await parseBody(c, AnswerBody);
    const row = findCheckpoint(deps.sqlite, job.jobId, c.req.param('checkpointId'));
    if (!row) throw new HttpError(404, 'checkpoint_not_found');
    const checkpoint = parseCheckpoint(row)!;
    if (checkpoint.decision_id === '' || checkpoint.version === undefined || !job.aiur) {
      return c.json({ status: 'not_linked' as const }, 425);
    }
    const option = checkpoint.options.find(({ id }) => id === option_id);
    if (!option) throw new HttpError(400, 'checkpoint_option_invalid');
    const client = await deps.registry.aiurClientFor?.(job.aiur.daemonSlug);
    if (!client) throw new HttpError(503, 'daemon_credentials_unavailable');
    const checkpointId = checkpoint.checkpoint_id ?? row.id;

    try {
      const decided = await client.decide(checkpoint.decision_id, {
        option: option_id,
        expected_version: checkpoint.version,
        idempotency_key: `ogm:${checkpointId}:${checkpoint.version}`,
        rationale: `Creator chose '${option.label}' in the build chat`,
      });
      const patch = { ...winnerPatch(decided), status: 'answered' as const, option_id };
      await runtime.inbox.write(job.jobId, {
        checkpoint_id: checkpointId,
        decision_id: checkpoint.decision_id,
        option_id,
        status: 'answered',
        at: new Date().toISOString(),
      });
      updateCheckpoint(deps.sqlite, row.id, patch);
      getChatRuntime(deps).hub.publish(job.jobId);
      return c.json({ status: 'answered' as const, decision_id: checkpoint.decision_id, option_id });
    } catch (error) {
      if (!(error instanceof AiurHttpError) || error.status !== 409) throw error;
      const winner = await client.decision(checkpoint.decision_id);
      const patch = winnerPatch(winner);
      if (patch.status === 'open') {
        updateCheckpoint(deps.sqlite, row.id, patch);
        getChatRuntime(deps).hub.publish(job.jobId);
        return c.json({ status: 'open' as const, by: 'other' as const }, 409);
      }
      await runtime.inbox.write(job.jobId, {
        checkpoint_id: checkpointId,
        decision_id: checkpoint.decision_id,
        ...(patch.option_id === undefined ? {} : { option_id: patch.option_id }),
        status: patch.status,
        at: new Date().toISOString(),
      });
      updateCheckpoint(deps.sqlite, row.id, patch);
      getChatRuntime(deps).hub.publish(job.jobId);
      return c.json({ status: patch.status, by: 'other' as const }, 409);
    }
  });
