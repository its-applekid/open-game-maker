import { randomUUID } from 'node:crypto';

import type { AchievementDef } from '@ogm/contracts';
import { schema, type Db } from '@ogm/db';
import { and, eq, sql } from 'drizzle-orm';

import { catalogForRelease, latestCatalog } from './catalog.js';

export type AchievementErrorCode = 'unknown_key' | 'retired' | 'not_published';

export class AchievementError extends Error {
  constructor(readonly code: AchievementErrorCode) {
    super(code);
    this.name = 'AchievementError';
  }
}

function definitionForAward(db: Db, gameId: string, releaseId: string, key: string): AchievementDef {
  const catalog = catalogForRelease(db, gameId, releaseId);
  if (!catalog) throw new AchievementError('not_published');
  const definition = catalog.find((candidate) => candidate.key === key);
  if (!definition) throw new AchievementError('unknown_key');
  if (definition.retired === true) throw new AchievementError('retired');
  return definition;
}

export function award(
  db: Db,
  input: {
    userId: string;
    gameId: string;
    key: string;
    releaseId: string;
    source: 'client' | 'room' | 'admin';
    now?: string;
  },
): { newlyAwarded: boolean } {
  definitionForAward(db, input.gameId, input.releaseId, input.key);
  const result = db
    .insert(schema.achievementAwards)
    .values({
      userId: input.userId,
      gameId: input.gameId,
      key: input.key,
      releaseId: input.releaseId,
      source: input.source,
      awardedAt: input.now ?? new Date().toISOString(),
    })
    .onConflictDoNothing()
    .run();
  return { newlyAwarded: result.changes === 1 };
}

export function progress(
  db: Db,
  input: { userId: string; gameId: string; key: string; value: number; releaseId: string; now?: string },
): { value: number; newlyAwarded: boolean } {
  if (!Number.isFinite(input.value) || input.value < 0)
    throw new RangeError('achievement progress must be nonnegative');
  const definition = definitionForAward(db, input.gameId, input.releaseId, input.key);
  db.insert(schema.achievementProgress)
    .values({ userId: input.userId, gameId: input.gameId, key: input.key, value: input.value })
    .onConflictDoUpdate({
      target: [schema.achievementProgress.userId, schema.achievementProgress.gameId, schema.achievementProgress.key],
      set: { value: sql`max(${schema.achievementProgress.value}, excluded.value)` },
    })
    .run();
  const stored = db
    .select({ value: schema.achievementProgress.value })
    .from(schema.achievementProgress)
    .where(
      and(
        eq(schema.achievementProgress.userId, input.userId),
        eq(schema.achievementProgress.gameId, input.gameId),
        eq(schema.achievementProgress.key, input.key),
      ),
    )
    .get();
  const value = stored?.value ?? input.value;
  const newlyAwarded =
    definition.progress !== undefined && value >= definition.progress.target
      ? award(db, { ...input, source: 'client' }).newlyAwarded
      : false;
  return { value, newlyAwarded };
}

export function listAchievements(db: Db, gameId: string, userId: string) {
  const catalog = latestCatalog(db, gameId) ?? [];
  const awards = new Map(
    db
      .select()
      .from(schema.achievementAwards)
      .where(and(eq(schema.achievementAwards.gameId, gameId), eq(schema.achievementAwards.userId, userId)))
      .all()
      .map((entry) => [entry.key, entry]),
  );
  const progressRows = new Map(
    db
      .select()
      .from(schema.achievementProgress)
      .where(and(eq(schema.achievementProgress.gameId, gameId), eq(schema.achievementProgress.userId, userId)))
      .all()
      .map((entry) => [entry.key, entry.value]),
  );

  return catalog.map((definition) => {
    const earned = awards.get(definition.key);
    const hidden = definition.hidden && !earned;
    return {
      key: definition.key,
      title: hidden ? '???' : definition.title,
      description: hidden ? '???' : definition.description,
      icon: definition.icon,
      hidden: definition.hidden,
      retired: definition.retired === true,
      target: definition.progress?.target ?? null,
      progress: progressRows.get(definition.key) ?? 0,
      earned: earned !== undefined,
      awardedAt: earned?.awardedAt ?? null,
    };
  });
}

export function revokeAward(
  db: Db,
  input: { userId: string; gameId: string; key: string; byUserId: string; now?: string },
): boolean {
  return db.transaction((tx) => {
    const result = tx
      .delete(schema.achievementAwards)
      .where(
        and(
          eq(schema.achievementAwards.userId, input.userId),
          eq(schema.achievementAwards.gameId, input.gameId),
          eq(schema.achievementAwards.key, input.key),
        ),
      )
      .run();
    tx.insert(schema.achievementAudit)
      .values({
        id: `aa_${randomUUID()}`,
        userId: input.userId,
        gameId: input.gameId,
        key: input.key,
        action: 'revoke',
        byUserId: input.byUserId,
        at: input.now ?? new Date().toISOString(),
      })
      .run();
    return result.changes === 1;
  });
}
