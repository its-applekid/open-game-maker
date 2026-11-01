import { createAiurClient, type AiurClient } from '@ogm/aiur-client';
import { daemonPaths, readIfPresent, type FeedFleet, type GameDaemon } from '@ogm/builder';
import { schema, type Db } from '@ogm/db';
import { eq } from 'drizzle-orm';

import { HttpError } from '../app/errors.js';

export function createDaemonDirectory(db: Db, home: string, fetchImpl: typeof fetch = globalThis.fetch) {
  async function clientFor(row: typeof schema.gameDaemons.$inferSelect): Promise<AiurClient> {
    const paths = daemonPaths(home, row.slug);
    const token = (await readIfPresent(paths.clientToken))?.trim() ?? '';
    if (token === '') throw new HttpError(503, 'daemon_credentials_unavailable');
    const supervisorToken = (await readIfPresent(paths.readToken))?.trim() || undefined;
    return createAiurClient(
      { baseUrl: `http://127.0.0.1:${row.port}`, token, ...(supervisorToken ? { supervisorToken } : {}) },
      fetchImpl,
    );
  }

  function toDaemon(row: typeof schema.gameDaemons.$inferSelect, clientToken: string): GameDaemon {
    return {
      repo: row.repo,
      checkoutPath: row.checkoutPath,
      unit: row.unit,
      envFile: row.envFile,
      port: row.port,
      clientToken,
      status: row.status,
    };
  }

  const fleet: FeedFleet = {
    async listDaemons(status) {
      const rows = status
        ? db.select().from(schema.gameDaemons).where(eq(schema.gameDaemons.status, status)).all()
        : db.select().from(schema.gameDaemons).all();
      return Promise.all(
        rows.map(async (row) => {
          const token = (await readIfPresent(daemonPaths(home, row.slug).clientToken))?.trim() ?? '';
          return toDaemon(row, token);
        }),
      );
    },
    async daemonFor(repo) {
      const row = db.select().from(schema.gameDaemons).where(eq(schema.gameDaemons.repo, repo)).get();
      if (!row) return null;
      const client = await clientFor(row);
      return { daemon: toDaemon(row, ''), client };
    },
  };

  return {
    fleet,
    async clientForRepo(repo: string): Promise<AiurClient> {
      const row = db.select().from(schema.gameDaemons).where(eq(schema.gameDaemons.repo, repo)).get();
      if (!row) throw new HttpError(409, 'daemon_not_found');
      return clientFor(row);
    },
  };
}
