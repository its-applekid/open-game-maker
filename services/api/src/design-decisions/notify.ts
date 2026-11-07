import type { DesignDecision } from '@ogm/contracts';
import { schema, type Db } from '@ogm/db';
import { and, desc, eq, isNotNull } from 'drizzle-orm';

import type { AppDeps } from '../app/types.js';

// The New Game request whose parent issue the Executor owns: the game's newest filed request. A design decision
// notifies that parent, because the Executor plans and re-plans the Build Order from there rather than from the
// creation chat's own ticket.
export type ParentTicket = { repo: string; number: number };

export function parentTicketFor(db: Db, gameId: string): ParentTicket | null {
  const row = db
    .select({ repo: schema.jobs.aiurRepo, number: schema.jobs.aiurIssueNumber })
    .from(schema.jobs)
    .where(
      and(eq(schema.jobs.gameId, gameId), eq(schema.jobs.kind, 'new_game'), isNotNull(schema.jobs.aiurIssueNumber)),
    )
    .orderBy(desc(schema.jobs.createdAt))
    .get();
  if (!row?.repo || row.number === null) return null;
  return { repo: row.repo, number: row.number };
}

export type ExecutorNotice =
  | { kind: 'default'; decision: DesignDecision; afterMs: number }
  | { kind: 'superseded'; decision: DesignDecision; previous: DesignDecision | null };

function labelOf(decision: DesignDecision, optionId: string): string {
  return decision.options.find(({ id }) => id === optionId)?.label ?? optionId;
}

// The Executor reads the parent issue's conversation, so one aiur message there is its notification. The text stays a
// privacy-safe summary: the decision id, the option labels the design agent wrote and the tickets to re-plan.
export function executorMessage(notice: ExecutorNotice): string {
  const affects =
    notice.decision.affects.length === 0 ? 'no ticket named' : `ticket ${notice.decision.affects.join(', ')}`;
  const chosen = `"${labelOf(notice.decision, notice.decision.chosen)}"`;
  if (notice.kind === 'default') {
    const minutes = Math.max(1, Math.round(notice.afterMs / 60_000));
    const waited = `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
    return `Design decision ${notice.decision.id} took its provisional default after ${waited} without a reply: ${chosen}. Affects ${affects}. Re-plan with gm-new-game-plan if that changes the Build Order.`;
  }
  const replaces = notice.previous === null ? '' : ` instead of "${labelOf(notice.previous, notice.previous.chosen)}"`;
  const previous = notice.previous === null ? 'the earlier answer' : notice.previous.id;
  return `Design decision ${notice.decision.id} supersedes ${previous}: ${chosen} now stands${replaces}. Affects ${affects}. Re-plan with gm-new-game-plan.`;
}

// Best effort: the decision is already recorded and the Command answered, so a failed message must never undo either.
// The failure is logged for the operator, and the Executor still finds the decision in the game's history.
export async function notifyExecutor(
  deps: AppDeps,
  daemonSlug: string | undefined,
  gameId: string,
  notice: ExecutorNotice,
): Promise<boolean> {
  const parent = parentTicketFor(deps.db, gameId);
  if (parent === null) {
    deps.log({ event: 'design-decision-parent-missing', gameId, decisionId: notice.decision.id });
    return false;
  }
  const client = daemonSlug === undefined ? null : ((await deps.registry.aiurClientFor?.(daemonSlug)) ?? null);
  if (client === null) {
    deps.log({ event: 'design-decision-client-unavailable', gameId, decisionId: notice.decision.id });
    return false;
  }
  try {
    await client.message(String(parent.number), executorMessage(notice), `design-decision-${notice.decision.id}`);
    deps.log({
      event: 'design-decision-notified',
      gameId,
      ticket: parent.number,
      decisionId: notice.decision.id,
      kind: notice.kind,
    });
    return true;
  } catch (error) {
    deps.log({
      event: 'design-decision-notify-error',
      gameId,
      ticket: parent.number,
      decisionId: notice.decision.id,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return false;
  }
}
