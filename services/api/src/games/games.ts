import { randomUUID } from 'node:crypto';

import type { Db } from '@ogm/db';
import { schema } from '@ogm/db';
import { and, eq, isNull, or } from 'drizzle-orm';

import type { AppDeps } from '../app/types.js';
import { HttpError } from '../app/errors.js';

export type GameRow = typeof schema.games.$inferSelect;

export function gameResponse(game: GameRow) {
  return {
    id: game.id,
    familyId: game.familyId,
    ownerId: game.ownerId,
    title: game.title,
    visibility: game.visibility,
    repoVisibility: game.repoVisibility,
    repo:
      game.githubOwner && game.githubRepo && game.repoUrl
        ? { owner: game.githubOwner, name: game.githubRepo, url: game.repoUrl }
        : null,
    createdAt: game.createdAt,
    delistedAt: game.delistedAt,
  };
}

export function findGame(db: Db, id: string): GameRow {
  const game = db.select().from(schema.games).where(eq(schema.games.id, id)).get();
  if (!game) throw new HttpError(404, 'game_not_found');
  return game;
}

export function findGameForFamily(db: Db, id: string, familyId: string): GameRow {
  const game = db
    .select()
    .from(schema.games)
    .where(and(eq(schema.games.id, id), eq(schema.games.familyId, familyId)))
    .get();
  if (!game) throw new HttpError(404, 'game_not_found');
  return game;
}

export function listGames(db: Db, familyId: string, userId: string): GameRow[] {
  return db
    .select()
    .from(schema.games)
    .where(
      and(
        eq(schema.games.familyId, familyId),
        isNull(schema.games.delistedAt),
        or(eq(schema.games.visibility, 'listed'), eq(schema.games.ownerId, userId)),
      ),
    )
    .all();
}

export function hasGameGrant(db: Db, gameId: string, userId: string): boolean {
  return Boolean(
    db
      .select({ gameId: schema.gameGrants.gameId })
      .from(schema.gameGrants)
      .where(and(eq(schema.gameGrants.gameId, gameId), eq(schema.gameGrants.userId, userId)))
      .get(),
  );
}

export function createGameRow(
  db: Db,
  input: { familyId: string; ownerId: string; title: string; repoVisibility: 'public' | 'private' },
): GameRow {
  const row: typeof schema.games.$inferInsert = {
    id: `g_${randomUUID()}`,
    familyId: input.familyId,
    ownerId: input.ownerId,
    title: input.title,
    visibility: 'private',
    repoVisibility: input.repoVisibility,
    createdAt: new Date().toISOString(),
  };
  db.insert(schema.games).values(row).run();
  return findGame(db, row.id);
}

export function requireGithubConnection(db: Db, userId: string) {
  const connection = db
    .select()
    .from(schema.githubConnections)
    .where(eq(schema.githubConnections.userId, userId))
    .get();
  if (!connection) throw new HttpError(409, 'github_not_connected');
  return connection;
}

export async function provisionGame(deps: AppDeps, game: GameRow): Promise<GameRow> {
  if (game.repoUrl) return game;
  const provisioner = deps.registry.repoProvisioner;
  if (!provisioner) throw new HttpError(503, 'repo_provisioner_unavailable');
  const owner = requireGithubConnection(deps.db, game.ownerId);

  try {
    const repo = await provisioner.provision({
      id: game.id,
      title: game.title,
      owner: { login: owner.login, installationId: owner.installationId },
      visibility: game.repoVisibility,
    });
    deps.db
      .update(schema.games)
      .set({ githubOwner: repo.owner, githubRepo: repo.repo, repoUrl: repo.url })
      .where(eq(schema.games.id, game.id))
      .run();
    return findGame(deps.db, game.id);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    deps.log({ event: 'repo-provision-failed', gameId: game.id, error: (error as Error).message });
    throw new HttpError(502, 'repo_provisioning_failed', undefined, { gameId: game.id });
  }
}
