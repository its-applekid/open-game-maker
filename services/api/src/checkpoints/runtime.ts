import type { AppDeps } from '../app/types.js';
import { createInboxWriter, type InboxWriter } from './inbox.js';

export type CheckpointRuntime = { inbox: InboxWriter; answers: Map<string, number[]> };

const runtimes = new WeakMap<AppDeps, CheckpointRuntime>();
export const ANSWERS_PER_MINUTE = 10;

// The inbox writer and answer limiter shared by every path that answers a Command — the checkpoint routes, a skip and
// the provisional-default sweep — so one process has one writer and one rate window per job.
export function setupCheckpointRuntime(deps: AppDeps): CheckpointRuntime {
  const existing = runtimes.get(deps);
  if (existing) return existing;
  const runtime: CheckpointRuntime = {
    inbox: createInboxWriter({ sqlite: deps.sqlite, log: deps.log }),
    answers: new Map(),
  };
  runtimes.set(deps, runtime);
  return runtime;
}

export function checkpointRuntime(deps: AppDeps): CheckpointRuntime {
  const runtime = runtimes.get(deps);
  if (!runtime) throw new Error('checkpoint context was not set up');
  return runtime;
}

export function allowAnswer(runtime: CheckpointRuntime, jobId: string, now = Date.now()): boolean {
  const recent = (runtime.answers.get(jobId) ?? []).filter((at) => now - at < 60_000);
  if (recent.length >= ANSWERS_PER_MINUTE) {
    runtime.answers.set(jobId, recent);
    return false;
  }
  recent.push(now);
  runtime.answers.set(jobId, recent);
  return true;
}
