import type { Sqlite } from '@ogm/db';

export type OptionalJob = {
  id: string;
  familyId: string;
  creatorId: string;
  usageMicroUsd: number;
};

type JobRow = { id: string; family_id: string; creator_id: string; usage_micro_usd: number };

export function jobsTableExists(sqlite: Sqlite): boolean {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'jobs'").get());
}

function mapJob(row: JobRow): OptionalJob {
  return {
    id: row.id,
    familyId: row.family_id,
    creatorId: row.creator_id,
    usageMicroUsd: row.usage_micro_usd,
  };
}

export function findOptionalJob(sqlite: Sqlite, jobId: string): OptionalJob | null {
  if (!jobsTableExists(sqlite)) return null;
  const row = sqlite
    .prepare<[string], JobRow>('SELECT id, family_id, creator_id, usage_micro_usd FROM jobs WHERE id = ?')
    .get(jobId);
  return row ? mapJob(row) : null;
}

export function optionalJobsForCreator(sqlite: Sqlite, familyId: string, creatorId: string): OptionalJob[] | null {
  if (!jobsTableExists(sqlite)) return null;
  return sqlite
    .prepare<[string, string], JobRow>(
      'SELECT id, family_id, creator_id, usage_micro_usd FROM jobs WHERE family_id = ? AND creator_id = ?',
    )
    .all(familyId, creatorId)
    .map(mapJob);
}

export function optionalGameUsage(
  sqlite: Sqlite,
  input: { familyId: string; gameId: string; from: string; to: string },
): number | null {
  if (!jobsTableExists(sqlite)) return null;
  const row = sqlite
    .prepare<[string, string, string, string, string], { usage: number }>(
      `SELECT COALESCE(SUM(usage_micro_usd), 0) AS usage FROM jobs
       WHERE family_id = ? AND id IN (
         SELECT DISTINCT job_id FROM activity_events
         WHERE family_id = ? AND game_id = ? AND ts >= ? AND ts <= ? AND job_id IS NOT NULL
       )`,
    )
    .get(input.familyId, input.familyId, input.gameId, input.from, input.to);
  return row?.usage ?? 0;
}
