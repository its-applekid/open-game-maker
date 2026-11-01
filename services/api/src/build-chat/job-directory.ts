import type { JobState } from '@ogm/contracts';
import { schema, type Db } from '@ogm/db';
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';

import type { ChatJob, ChatJobDirectory } from '../app/registry.js';

const ACTIVE_CHAT_STATES: JobState[] = ['filed', 'running', 'paused_budget'];

type ChatJobRow = {
  jobId: string;
  gameId: string;
  familyId: string;
  ownerId: string;
  state: JobState;
  daemonSlug: string | null;
  issueNumber: number | null;
};

function toChatJob(row: ChatJobRow): ChatJob {
  return {
    jobId: row.jobId,
    gameId: row.gameId,
    familyId: row.familyId,
    ownerId: row.ownerId,
    state: row.state,
    aiur:
      row.daemonSlug === null || row.issueNumber === null
        ? null
        : { daemonSlug: row.daemonSlug, ticket: String(row.issueNumber) },
  };
}

export function createChatJobDirectory(db: Db): ChatJobDirectory {
  const selection = {
    jobId: schema.jobs.id,
    gameId: schema.jobs.gameId,
    familyId: schema.jobs.familyId,
    ownerId: schema.jobs.creatorId,
    state: schema.jobs.state,
    daemonSlug: schema.gameDaemons.slug,
    issueNumber: schema.jobs.aiurIssueNumber,
  };

  return {
    async get(jobId) {
      const row = db
        .select(selection)
        .from(schema.jobs)
        .leftJoin(schema.gameDaemons, eq(schema.jobs.aiurRepo, schema.gameDaemons.repo))
        .where(eq(schema.jobs.id, jobId))
        .get();
      return row ? toChatJob(row) : null;
    },
    async active() {
      return db
        .select(selection)
        .from(schema.jobs)
        .innerJoin(schema.gameDaemons, eq(schema.jobs.aiurRepo, schema.gameDaemons.repo))
        .where(and(inArray(schema.jobs.state, ACTIVE_CHAT_STATES), isNotNull(schema.jobs.aiurIssueNumber)))
        .orderBy(asc(schema.jobs.createdAt), asc(schema.jobs.id))
        .all()
        .map(toChatJob);
    },
  };
}
