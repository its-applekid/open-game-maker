import { createAiurClient, type AiurClient } from '@ogm/aiur-client';
import { daemonPaths, readIfPresent, type FeedFleet, type GameDaemon } from '@ogm/builder';
import { schema, type Db } from '@ogm/db';
import { eq } from 'drizzle-orm';

import { HttpError } from '../app/errors.js';
import { gameSlugFor } from '../games/games.js';

// A daemon is keyed by the game's slug, so a game id resolves to its row through the game's own slug. Two games in
// one instance repository therefore reach their own daemon and never each other's.
export function daemonRowForGame(db: Db, gameId: string): typeof schema.gameDaemons.$inferSelect | undefined {
  const slug = gameSlugFor(db, gameId);
  if (slug === null) return undefined;
  return db.select().from(schema.gameDaemons).where(eq(schema.gameDaemons.slug, slug)).get();
}

export function createDaemonDirectory(db: Db, home: string, fetchImpl: typeof fetch = globalThis.fetch) {
  async function clientFor(row: typeof schema.gameDaemons.$inferSelect): Promise<AiurClient> {
    const paths = daemonPaths(home, row.slug);
    const [clientToken, readToken] = await Promise.all([
      readIfPresent(paths.clientToken),
      readIfPresent(paths.readToken),
    ]);
    const token = clientToken?.trim() ?? '';
    if (token === '') throw new HttpError(503, 'daemon_credentials_unavailable');
    const supervisorToken = readToken?.trim() || undefined;
    return createAiurClient(
      { baseUrl: `http://127.0.0.1:${row.port}`, token, ...(supervisorToken ? { supervisorToken } : {}) },
      fetchImpl,
    );
  }

  function toDaemon(row: typeof schema.gameDaemons.$inferSelect, clientToken: string): GameDaemon {
    return {
      slug: row.slug,
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
      return rows.map((row) => toDaemon(row, ''));
    },
    async daemonFor(gameSlug) {
      const row = db.select().from(schema.gameDaemons).where(eq(schema.gameDaemons.slug, gameSlug)).get();
      if (!row) return null;
      const client = await clientFor(row);
      return { daemon: toDaemon(row, ''), client };
    },
  };

  return {
    fleet,
    async clientForSlug(slug: string): Promise<AiurClient | null> {
      const row = db.select().from(schema.gameDaemons).where(eq(schema.gameDaemons.slug, slug)).get();
      return row ? clientFor(row) : null;
    },
    // A game's daemon, reached from the game id every job and route carries. Throws when the game has none.
    async clientForGame(gameId: string): Promise<AiurClient> {
      const row = daemonRowForGame(db, gameId);
      if (!row) throw new HttpError(409, 'daemon_not_found');
      return clientFor(row);
    },
    async daemonClientForGame(gameId: string): Promise<AiurClient | null> {
      const row = daemonRowForGame(db, gameId);
      return row ? clientFor(row) : null;
    },
  };
}
