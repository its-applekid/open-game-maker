import type { AgreedScope, ScopeChoices, ScopeSession } from '@ogm/contracts';
import { ScopeSession as ScopeSessionSchema } from '@ogm/contracts';
import { schema, type Db } from '@ogm/db';
import { and, eq } from 'drizzle-orm';

type SessionRow = typeof schema.scopeSessions.$inferSelect;

function toSession(row: SessionRow): ScopeSession {
  return ScopeSessionSchema.parse({
    id: row.id,
    game_id: row.gameId,
    creator_id: row.creatorId,
    job_id: row.jobId,
    ...(row.ticket === null ? {} : { ticket: row.ticket }),
    status: row.status,
    choices: JSON.parse(row.choices) as unknown,
    ...(row.scope === null ? {} : { scope: JSON.parse(row.scope) as unknown }),
    at: row.createdAt,
  });
}

function rowById(db: Db, id: string): SessionRow | null {
  return db.select().from(schema.scopeSessions).where(eq(schema.scopeSessions.id, id)).get() ?? null;
}

function rowByJob(db: Db, jobId: string): SessionRow | null {
  return db.select().from(schema.scopeSessions).where(eq(schema.scopeSessions.jobId, jobId)).get() ?? null;
}

export const scopeSessions = {
  get(db: Db, id: string): ScopeSession | null {
    const row = rowById(db, id);
    return row === null ? null : toSession(row);
  },

  getByJob(db: Db, jobId: string): ScopeSession | null {
    const row = rowByJob(db, jobId);
    return row === null ? null : toSession(row);
  },

  rowByJob,

  findOpen(db: Db, gameId: string): ScopeSession | null {
    const row = db
      .select()
      .from(schema.scopeSessions)
      .where(and(eq(schema.scopeSessions.gameId, gameId), eq(schema.scopeSessions.status, 'open')))
      .get();
    return row === undefined ? null : toSession(row);
  },

  create(
    db: Db,
    input: { id: string; gameId: string; creatorId: string; jobId: string; choices: ScopeChoices; at: string },
  ): ScopeSession {
    db.insert(schema.scopeSessions)
      .values({
        id: input.id,
        gameId: input.gameId,
        creatorId: input.creatorId,
        jobId: input.jobId,
        status: 'open',
        choices: JSON.stringify(input.choices),
        createdAt: input.at,
        updatedAt: input.at,
      })
      .run();
    return toSession(rowById(db, input.id)!);
  },

  abandon(db: Db, id: string, at = new Date().toISOString()): ScopeSession | null {
    db.update(schema.scopeSessions)
      .set({ status: 'abandoned', updatedAt: at })
      .where(and(eq(schema.scopeSessions.id, id), eq(schema.scopeSessions.status, 'open')))
      .run();
    const row = rowById(db, id);
    return row === null ? null : toSession(row);
  },

  agree(db: Db, id: string, scope: AgreedScope, hash: string, at: string): boolean {
    return (
      db
        .update(schema.scopeSessions)
        .set({ status: 'agreed', scope: JSON.stringify(scope), scopeHash: hash, updatedAt: at })
        .where(and(eq(schema.scopeSessions.id, id), eq(schema.scopeSessions.status, 'open')))
        .run().changes > 0
    );
  },
};
