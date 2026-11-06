import { AiurHttpError, AiurUnavailableError, type AiurClient } from '@ogm/aiur-client';
import { Reservation, type JobStage } from '@ogm/contracts';
import { schema, type Db, type Sqlite } from '@ogm/db';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import type { AppEvents } from '../app/events.js';
import type { LogLine } from '../app/types.js';
import { isCapRaiseInProgress, markPaused, type LifecycleDeps } from '../jobs/spend-cap.js';
import type { JobRow } from '../jobs/repo.js';
import { getBudgetSettings, type BudgetDefaults } from './settings.js';
import { recordUsage, releaseReservation } from './ledger.js';
import { safeMicro, usdToMicro } from './micro.js';

export type UsageInput = {
  usageMicroUsd: number;
  pessimisticMicroUsd: number;
  coverageStatus: string;
};
export type ApplyUsage = (job: JobRow, usage: UsageInput) => void | Promise<void>;

export type UsageReconcilerDeps = {
  db: Db;
  sqlite: Sqlite;
  events: AppEvents;
  defaults: BudgetDefaults;
  // The game's daemon: usage is read from the daemon that runs the game's builds.
  daemonFor: (gameId: string) => Promise<Pick<AiurClient, 'usage'> | null>;
  applyUsage: ApplyUsage;
  now?: () => Date;
  log?: (line: LogLine) => void;
};

const ACTIVE_STATES = ['filed', 'running', 'paused_budget'] as const;
const RECONCILE_STATES = [...ACTIVE_STATES, 'done', 'failed', 'cancelled'] as const;
const TERMINAL_STAGES = new Set<JobStage>(['done', 'failed', 'cancelled', 'out_of_budget']);
const RETRYABLE_SKIPS = new Set(['daemon_unavailable', 'usage_unavailable']);

function nowFor(deps: UsageReconcilerDeps): Date {
  return (deps.now ?? (() => new Date()))();
}

function money(value: string | undefined): number {
  return safeMicro(usdToMicro(value ?? '0'));
}

export function createApplyUsage(deps: LifecycleDeps): ApplyUsage {
  return (job, usage) => {
    if (job.state !== 'running' || job.releasedAt !== null) return;
    const reservation = Reservation.parse(JSON.parse(job.reservation)).amountMicroUsd;
    if (usage.usageMicroUsd >= job.hardCapMicroUsd) {
      markPaused(deps, job.id, 'budget_exhausted');
    } else if (usage.coverageStatus !== 'complete' && usage.pessimisticMicroUsd >= reservation) {
      markPaused(deps, job.id, 'over_reservation');
    }
  };
}

export async function reconcileJob(
  deps: UsageReconcilerDeps,
  jobId: string,
): Promise<{ usageMicroUsd: number; coverage: string } | { skipped: string }> {
  const job = deps.db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId)).get();
  if (!job) return { skipped: 'job_not_found' };
  if (job.aiurRepo === null || job.aiurIssueNumber === null) return { skipped: 'job_not_filed' };
  const client = await deps.daemonFor(job.gameId);
  if (client === null) return { skipped: 'daemon_unavailable' };

  let usage: Awaited<ReturnType<AiurClient['usage']>>;
  try {
    usage = await client.usage(String(job.aiurIssueNumber));
  } catch (error) {
    if (error instanceof AiurHttpError && ['usage_unavailable', 'usage_not_found'].includes(error.code)) {
      return { skipped: error.code };
    }
    if (error instanceof AiurUnavailableError) return { skipped: 'daemon_unavailable' };
    throw error;
  }

  const observedAt = nowFor(deps);
  const settings = getBudgetSettings(deps.db, job.familyId, deps.defaults);
  const previousSamples = new Map(
    deps.db
      .select({ runId: schema.usageSamples.runId, apiEquivalentMicro: schema.usageSamples.apiEquivalentMicro })
      .from(schema.usageSamples)
      .where(eq(schema.usageSamples.jobId, job.id))
      .all()
      .map((sample) => [sample.runId, sample.apiEquivalentMicro] as const),
  );
  for (const session of usage.sessions) {
    const apiEquivalentMicro = money(session.api_equivalent.amount.USD);
    const providerReportedMicro = money(session.provider_reported.USD);
    const previous = previousSamples.get(session.run_id);
    // The ledger write comes first: a crash can repeat it safely, while a sample written first could hide missing usage.
    if (previous === undefined || apiEquivalentMicro > previous) {
      recordUsage({
        db: deps.db,
        jobId: job.id,
        microUsd: apiEquivalentMicro,
        runId: session.run_id,
        at: observedAt,
        zone: settings.resetZone,
      });
    }
    deps.db
      .insert(schema.usageSamples)
      .values({
        jobId: job.id,
        runId: session.run_id,
        repo: job.aiurRepo,
        issue: job.aiurIssueNumber,
        providerReportedMicro,
        apiEquivalentMicro,
        coverageStatus: session.api_equivalent.coverage.status,
        observedAt: observedAt.toISOString(),
      })
      .onConflictDoUpdate({
        target: [schema.usageSamples.jobId, schema.usageSamples.runId],
        set: {
          repo: job.aiurRepo,
          issue: job.aiurIssueNumber,
          providerReportedMicro,
          apiEquivalentMicro,
          coverageStatus: session.api_equivalent.coverage.status,
          observedAt: observedAt.toISOString(),
        },
      })
      .run();
  }

  const total = money(usage.totals.api_equivalent.amount.USD);
  const coverage = usage.totals.api_equivalent.coverage.status;
  const latestRunId = usage.sessions.at(-1)?.run_id ?? job.aiurRunId;
  const current = deps.db.select().from(schema.jobs).where(eq(schema.jobs.id, job.id)).get()!;
  const usageMicroUsd = Math.max(current.usageMicroUsd, total);
  if (
    usageMicroUsd !== current.usageMicroUsd ||
    coverage !== current.usageCoverage ||
    latestRunId !== current.aiurRunId
  ) {
    deps.db
      .update(schema.jobs)
      .set({
        usageMicroUsd,
        usageCoverage: coverage,
        aiurRunId: latestRunId,
        updatedAt: observedAt.toISOString(),
      })
      .where(eq(schema.jobs.id, job.id))
      .run();
  }

  const reservation = Reservation.parse(JSON.parse(job.reservation)).amountMicroUsd;
  const pessimisticMicroUsd = coverage === 'complete' ? usageMicroUsd : Math.max(usageMicroUsd, reservation);
  await deps.applyUsage(deps.db.select().from(schema.jobs).where(eq(schema.jobs.id, job.id)).get()!, {
    usageMicroUsd,
    pessimisticMicroUsd,
    coverageStatus: coverage,
  });
  return { usageMicroUsd, coverage };
}

export function releaseTerminal(deps: UsageReconcilerDeps, jobId: string, stage: JobStage): boolean {
  if (!TERMINAL_STAGES.has(stage)) return false;
  const row = deps.db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId)).get();
  if (!row) return false;
  if (stage === 'out_of_budget' && (row.state !== 'paused_budget' || isCapRaiseInProgress(jobId))) return false;
  const at = nowFor(deps);
  const settings = getBudgetSettings(deps.db, row.familyId, deps.defaults);
  return deps.sqlite
    .transaction(() => {
      const claimed = deps.db
        .update(schema.jobs)
        .set({ releasedAt: at.toISOString(), updatedAt: at.toISOString() })
        .where(and(eq(schema.jobs.id, jobId), isNull(schema.jobs.releasedAt)))
        .run();
      if (claimed.changes === 0) return false;
      releaseReservation({ db: deps.db, jobId, at, zone: settings.resetZone });
      return true;
    })
    .immediate();
}

export function startUsageReconciler(deps: UsageReconcilerDeps, intervalMs = 60_000) {
  const tails = new Map<string, Promise<void>>();
  const pending = new Set<Promise<void>>();

  const schedule = (jobId: string, terminal?: JobStage) => {
    const previous = tails.get(jobId) ?? Promise.resolve();
    const operation = previous
      .catch(() => undefined)
      .then(async () => {
        if (terminal === undefined) {
          await reconcileJob(deps, jobId);
          return;
        }
        const result = await reconcileJob(deps, jobId);
        if ('skipped' in result && RETRYABLE_SKIPS.has(result.skipped)) return;
        releaseTerminal(deps, jobId, terminal);
      })
      .catch((error: unknown) => {
        deps.log?.({ event: 'usage-reconcile-error', jobId, error: (error as Error).name });
      });
    const tracked = operation.finally(() => {
      pending.delete(tracked);
      if (tails.get(jobId) === tracked) tails.delete(jobId);
    });
    tails.set(jobId, tracked);
    pending.add(tracked);
  };

  const tick = () => {
    const jobs = deps.db
      .select({ id: schema.jobs.id, state: schema.jobs.state, stage: schema.jobProjections.stage })
      .from(schema.jobs)
      .leftJoin(schema.jobProjections, eq(schema.jobs.id, schema.jobProjections.jobId))
      .where(and(inArray(schema.jobs.state, RECONCILE_STATES), isNull(schema.jobs.releasedAt)))
      .all();
    for (const { id, state, stage } of jobs) {
      if (state === 'done' || state === 'failed' || state === 'cancelled') schedule(id, state);
      else if (stage === 'out_of_budget') schedule(id, stage);
      else schedule(id);
    }
  };

  const offUsage = deps.events.on('job.usage.changed', ({ jobId }) => schedule(jobId));
  const offJob = deps.events.on('job.changed', ({ jobId, state }) => {
    if (state === 'done' || state === 'failed' || state === 'cancelled') schedule(jobId, state);
  });
  const offStage = deps.events.on('job.stage.changed', ({ jobId, to }) => {
    if (TERMINAL_STAGES.has(to)) schedule(jobId, to);
  });
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();

  return {
    stop() {
      clearInterval(timer);
      offUsage();
      offJob();
      offStage();
    },
    async idle() {
      while (pending.size > 0) await Promise.all([...pending]);
    },
  };
}
