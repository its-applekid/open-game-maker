import type { Decision } from '@ogm/aiur-client';
import { schema } from '@ogm/db';
import { and, eq } from 'drizzle-orm';

import type { FeedDeps, RunningDaemon } from './types.js';

type CheckpointStatus = 'open' | 'answered' | 'moot';

// aiur decision_status → checkpoint status. Anything not listed (a future status) is treated as still open.
const STATUS: Record<string, CheckpointStatus> = {
  open: 'open',
  deferred: 'open',
  decided: 'answered',
  acknowledged: 'answered',
  resolved: 'answered',
  expired: 'moot',
  dismissed: 'moot',
  moot: 'moot',
};

function statusOf(decision: Decision): CheckpointStatus {
  if (decision.answer !== undefined && decision.answer !== null) return 'answered';
  return Object.hasOwn(STATUS, decision.decision_status)
    ? (STATUS[decision.decision_status] as CheckpointStatus)
    : 'open';
}

function recommendOf(decision: Decision): string | null {
  const recommendation = decision.recommendation as { option_id?: unknown } | null | undefined;
  return typeof recommendation?.option_id === 'string' ? recommendation.option_id : null;
}

// Mirrors aiur Commands (not on the outbound feed) into `checkpoints`. Reads with the supervisor token, never answers.
export function createDecisionsPoller(deps: FeedDeps) {
  const log = deps.log ?? (() => undefined);
  const now = deps.now ?? (() => new Date());
  const { checkpoints } = schema;

  async function pollDaemon(daemon: RunningDaemon): Promise<void> {
    const jobs = await deps.activeJobs(daemon.slug);
    const jobByTicket = new Map(jobs.map((job) => [job.ticket, job.jobId]));
    const decisions = (await daemon.client.decisions()).filter((d) => jobByTicket.has(d.ticket.identifier));
    const at = now().toISOString();
    const seen = new Set<string>();

    for (const decision of decisions) {
      const jobId = jobByTicket.get(decision.ticket.identifier) as string;
      const status = statusOf(decision);
      seen.add(decision.decision_id);
      const existing = deps.db.select().from(checkpoints).where(eq(checkpoints.decisionId, decision.decision_id)).get();
      const fields = {
        version: decision.version,
        question: decision.question,
        options: JSON.stringify(decision.options.map(({ id, label }) => ({ id, label }))),
        recommend: recommendOf(decision),
        status,
        answeredAt: status === 'open' ? null : (existing?.answeredAt ?? at),
      };
      deps.db
        .insert(checkpoints)
        .values({
          decisionId: decision.decision_id,
          jobId,
          daemonSlug: daemon.slug,
          openedAt: decision.created_at,
          ...fields,
        })
        .onConflictDoUpdate({ target: checkpoints.decisionId, set: fields })
        .run();
      if (status === 'open' && existing?.status !== 'open') {
        deps.emit?.({ kind: 'checkpoint.opened', jobId, decisionId: decision.decision_id });
      } else if (status !== 'open' && existing?.status === 'open') {
        deps.emit?.({ kind: 'checkpoint.answered', jobId, decisionId: decision.decision_id });
      }
    }

    // An open checkpoint whose Command left the list was answered in aiur; one whose job ended is moot.
    const activeJobIds = new Set(jobByTicket.values());
    const open = deps.db
      .select()
      .from(checkpoints)
      .where(and(eq(checkpoints.daemonSlug, daemon.slug), eq(checkpoints.status, 'open')))
      .all();
    for (const row of open.filter((r) => !seen.has(r.decisionId))) {
      const status = activeJobIds.has(row.jobId) ? 'answered' : 'moot';
      deps.db
        .update(checkpoints)
        .set({ status, answeredAt: at })
        .where(eq(checkpoints.decisionId, row.decisionId))
        .run();
      deps.emit?.({ kind: 'checkpoint.answered', jobId: row.jobId, decisionId: row.decisionId });
    }
  }

  return async (running: RunningDaemon[]): Promise<void> => {
    for (const daemon of running) {
      await pollDaemon(daemon).catch((error: unknown) =>
        log({ event: 'aiur-decisions-poll-failed', daemon: daemon.slug, error: String(error) }),
      );
    }
  };
}
