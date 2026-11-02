import type { Branch } from '@ogm/contracts';
import type { Sqlite } from '@ogm/db';
import { deriveVersion } from '@ogm/design-log';

type TransactionCountRow = { count: number };

export interface VersionCounts {
  publishCount(gameId: string): Promise<number>;
  buildsSinceFork(branch: Branch): Promise<number>;
  txSinceLatestBuild(branch: Branch): Promise<number>;
  versionFor(branch: Branch): Promise<string>;
}

export function createVersionCounts(sqlite: Sqlite): VersionCounts {
  const counts: VersionCounts = {
    // OGM-045 completes these two counters when it adds releases and builds.
    publishCount: async () => 0,
    buildsSinceFork: async () => 0,
    txSinceLatestBuild: async (branch) => {
      const row = sqlite
        .prepare<[string, string], TransactionCountRow>(
          `SELECT COUNT(*) AS count
           FROM design_transactions
           WHERE branch_id = ?
             AND rev > COALESCE((
               SELECT MAX(rev)
               FROM design_transactions
               WHERE branch_id = ?
                 AND kind = 'system'
                 AND json_extract(commands_json, '$[0].op') = 'invoke'
                 AND json_extract(commands_json, '$[0].command') = 'build.switch'
             ), 0)`,
        )
        .get(branch.id, branch.id);
      return row?.count ?? 0;
    },
    versionFor: async (branch) => {
      const [publishCount, buildsSinceFork, txSinceLatestBuild] = await Promise.all([
        counts.publishCount(branch.gameId),
        counts.buildsSinceFork(branch),
        counts.txSinceLatestBuild(branch),
      ]);
      return deriveVersion({ publishCount, buildsSinceFork, txSinceLatestBuild });
    },
  };
  return counts;
}
