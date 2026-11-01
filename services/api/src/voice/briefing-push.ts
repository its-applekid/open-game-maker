import type { JobState } from '@ogm/contracts';
import { schema, type Db } from '@ogm/db';
import { and, desc, eq, notInArray } from 'drizzle-orm';

import type { AppEvents } from '../app/events.js';
import { sizeClassRow } from '../budget/estimate.js';
import { getBudgetSettings, type BudgetDefaults } from '../budget/settings.js';
import { budgetStatus } from '../budget/status.js';
import { toUnits } from '../budget/units.js';

// T06 §4.
export type VoiceTarget =
  | { kind: 'scope'; game_id: string; session_id: string; creator_id: string }
  | { kind: 'build'; game_id: string; job_id: string; ticket: string; creator_id: string };

export type Briefing = {
  target_key: string;
  summary: string;
  current_task: string;
  next_steps: string[];
  waiting_on: string | null;
  questions: string[];
  extra: { title: string; text: string }[];
  sections: { id: 'budget' | 'progress'; text: string }[];
  observed_at: string;
};

export type BriefingDeps = { db: Db; defaults: BudgetDefaults; now?: () => Date };

export type PushDeps = BriefingDeps & {
  url: string;
  secret: string;
  log: (line: Record<string, unknown>) => void;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

const SIZES = ['small', 'medium', 'large', 'huge'] as const;
const TERMINAL: JobState[] = ['done', 'failed', 'cancelled'];
const OFFERS = 'If it does not fit: trim, split, queue for the reset, or ask an admin.';

export const targetKey = (target: VoiceTarget) =>
  `${target.kind}:${target.kind === 'scope' ? target.session_id : target.job_id}`;

function localTime(at: string, zone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit' }).format(
      new Date(at),
    );
  } catch {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }).format(
      new Date(at),
    );
  }
}

function budgetText(deps: BriefingDeps, familyId: string, userId: string, now: Date): string {
  const settings = getBudgetSettings(deps.db, familyId, deps.defaults);
  const status = budgetStatus(deps, { familyId, userId, now });
  const units = (microUsd: number) => toUnits(microUsd, settings).units;
  const table = SIZES.map((size) => {
    const row = sizeClassRow(deps.db, 'feature', size);
    return `${size} ≈ ${units(row.p50MicroUsd)}–${units(row.p80MicroUsd)}`;
  }).join(', ');
  return (
    `${units(status.remainingMicroUsd)} ${settings.unitLabel} left today (${status.remainingPercent}%); ` +
    `resets ${localTime(status.resetsAt, settings.resetZone)}; ${status.freeSlots.edit} free edit slots; ` +
    `${status.queued.length} queued. Typical sizes in ${settings.unitLabel}: ${table}.`
  );
}

function jobFor(db: Db, target: VoiceTarget) {
  if (target.kind === 'build') return db.select().from(schema.jobs).where(eq(schema.jobs.id, target.job_id)).get();
  return db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.gameId, target.game_id), notInArray(schema.jobs.state, TERMINAL)))
    .orderBy(desc(schema.jobs.createdAt))
    .get();
}

export async function buildBriefing(deps: BriefingDeps, target: VoiceTarget): Promise<Briefing> {
  const now = (deps.now ?? (() => new Date()))();
  const game = deps.db.select().from(schema.games).where(eq(schema.games.id, target.game_id)).get();
  if (!game) throw new Error(`unknown game ${target.game_id}`);
  const job = jobFor(deps.db, target);
  const stage = job
    ? (deps.db.select().from(schema.jobProjections).where(eq(schema.jobProjections.jobId, job.id)).get()?.stageText ??
      job.state)
    : null;
  const budget = budgetText(deps, game.familyId, target.creator_id, now);
  return {
    target_key: targetKey(target),
    summary: target.kind === 'build' && job ? (JSON.parse(job.plan) as { title: string }).title : game.title,
    current_task: target.kind === 'scope' ? 'Agreeing the scope' : (stage ?? 'No build running'),
    next_steps: target.kind === 'scope' ? ['Confirm the plan', 'Start the build or queue it for the reset'] : [],
    waiting_on: job?.state === 'paused_budget' ? 'an admin' : null,
    questions: [],
    extra: [{ title: 'Budget', text: budget }],
    sections: [
      { id: 'budget', text: `${budget} ${OFFERS}` },
      { id: 'progress', text: stage ?? 'No build running.' },
    ],
    observed_at: now.toISOString(),
  };
}

const lastFailureLog = new Map<string, number>();

// Best effort: never rejects, gives up at the timeout, logs a failing target at most once a minute.
export async function pushBriefing(deps: PushDeps, target: VoiceTarget): Promise<void> {
  const key = targetKey(target);
  try {
    const briefing = await buildBriefing(deps, target);
    const response = await (deps.fetch ?? fetch)(`${deps.url.replace(/\/$/, '')}/internal/briefing`, {
      method: 'POST',
      headers: { authorization: `Bearer ${deps.secret}`, 'content-type': 'application/json' },
      body: JSON.stringify(briefing),
      signal: AbortSignal.timeout(deps.timeoutMs ?? 300),
      redirect: 'error',
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`voice host answered ${response.status}`);
  } catch (error) {
    const at = Date.now();
    if (at - (lastFailureLog.get(key) ?? -Infinity) < 60_000) return;
    lastFailureLog.set(key, at);
    deps.log({ event: 'briefing-push-failed', target_key: key, error: (error as Error).message });
  }
}

const targets = new Map<string, { target: VoiceTarget; expiresAt: number }>();
let pusher: { deps: PushDeps; debounceMs: number; timers: Map<string, NodeJS.Timeout> } | null = null;

export function activeTargetFor(creatorId: string): VoiceTarget | null {
  const entry = targets.get(creatorId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    targets.delete(creatorId);
    return null;
  }
  return entry.target;
}

function schedulePush(creatorId: string): void {
  const active = pusher;
  if (!active || !activeTargetFor(creatorId)) return;
  clearTimeout(active.timers.get(creatorId));
  const timer = setTimeout(() => {
    active.timers.delete(creatorId);
    const target = activeTargetFor(creatorId);
    if (target) void pushBriefing(active.deps, target);
  }, active.debounceMs);
  timer.unref();
  active.timers.set(creatorId, timer);
}

// OGM-085 calls this after minting a voice token; the newest target per creator wins and is pushed at once.
export function registerVoiceTarget(target: VoiceTarget, ttlSec = 1800): void {
  targets.set(target.creator_id, { target, expiresAt: Date.now() + ttlSec * 1000 });
  if (pusher) void pushBriefing(pusher.deps, target);
}

export function startBriefingPush(deps: PushDeps & { events: AppEvents; debounceMs?: number }): () => void {
  const timers = new Map<string, NodeJS.Timeout>();
  pusher = { deps, debounceMs: deps.debounceMs ?? 500, timers };
  const offBudget = deps.events.on('budget.changed', ({ userId }) => schedulePush(userId));
  const offJob = deps.events.on('job.changed', ({ jobId }) => {
    const job = deps.db
      .select({ creatorId: schema.jobs.creatorId })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, jobId))
      .get();
    if (job) schedulePush(job.creatorId);
  });
  return () => {
    offBudget();
    offJob();
    for (const timer of timers.values()) clearTimeout(timer);
    pusher = null;
    targets.clear();
    lastFailureLog.clear();
  };
}
