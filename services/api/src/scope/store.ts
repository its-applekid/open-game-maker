import type { AgreedScope, ScopeChoices, ScopeSession } from '@ogm/contracts';
import { AgreedScope as AgreedScopeSchema, ScopeSession as ScopeSessionSchema } from '@ogm/contracts';
import { schema, type Db } from '@ogm/db';
import { and, asc, eq, inArray } from 'drizzle-orm';

type SessionRow = typeof schema.scopeSessions.$inferSelect;

function toSession(row: SessionRow): ScopeSession {
  return ScopeSessionSchema.parse({
    id: row.id,
    game_id: row.gameId,
    creator_id: row.creatorId,
    job_id: row.jobId,
    ...(row.ticket === null ? {} : { ticket: row.ticket }),
    status: row.status,
    revision: row.revision,
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

  findActive(db: Db, gameId: string): ScopeSession | null {
    const row = db
      .select()
      .from(schema.scopeSessions)
      .where(and(eq(schema.scopeSessions.gameId, gameId), inArray(schema.scopeSessions.status, ['open', 'revising'])))
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
    const result = db
      .update(schema.scopeSessions)
      .set({ status: 'abandoned', updatedAt: at })
      .where(and(eq(schema.scopeSessions.id, id), inArray(schema.scopeSessions.status, ['open', 'revising'])))
      .run();
    if (result.changes === 0) return null;
    return toSession(rowById(db, id)!);
  },

  agree(db: Db, id: string, scope: AgreedScope, hash: string, at: string): boolean {
    const previousRevision = scope.revision - 1;
    const changed = db
      .update(schema.scopeSessions)
      .set({
        status: 'agreed',
        revision: scope.revision,
        scope: JSON.stringify(scope),
        scopeHash: hash,
        updatedAt: at,
      })
      .where(
        and(
          eq(schema.scopeSessions.id, id),
          eq(schema.scopeSessions.revision, previousRevision),
          inArray(schema.scopeSessions.status, ['open', 'revising']),
        ),
      )
      .run().changes;
    if (changed === 0) return false;
    db.insert(schema.scopeSessionRevisions)
      .values({ sessionId: id, revision: scope.revision, scope: JSON.stringify(scope), scopeHash: hash, agreedAt: at })
      .run();
    return true;
  },

  beginRevision(db: Db, id: string, expectedRevision: number, at = new Date().toISOString()): ScopeSession | null {
    const changed = db
      .update(schema.scopeSessions)
      .set({ status: 'revising', updatedAt: at })
      .where(
        and(
          eq(schema.scopeSessions.id, id),
          eq(schema.scopeSessions.status, 'agreed'),
          eq(schema.scopeSessions.revision, expectedRevision),
        ),
      )
      .run().changes;
    const row = rowById(db, id);
    const session = row === null ? null : toSession(row);
    if (changed > 0) return session;
    return session?.status === 'revising' && session.revision === expectedRevision ? session : null;
  },

  revisions(db: Db, id: string) {
    return db
      .select()
      .from(schema.scopeSessionRevisions)
      .where(eq(schema.scopeSessionRevisions.sessionId, id))
      .orderBy(asc(schema.scopeSessionRevisions.revision))
      .all()
      .map((row) => ({
        revision: row.revision,
        scope: AgreedScopeSchema.parse(JSON.parse(row.scope) as unknown),
        hash: row.scopeHash,
        at: row.agreedAt,
      }));
  },
};
