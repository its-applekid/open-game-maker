import { AchievementDefSchema, type AchievementDef } from '@ogm/contracts';
import { schema, type Db } from '@ogm/db';
import { and, desc, eq } from 'drizzle-orm';

import { CatalogLintError, lintCatalog } from './lint.js';

function parsedDefinitions(value: string): AchievementDef[] {
  return AchievementDefSchema.array().parse(JSON.parse(value));
}

export function catalogForRelease(db: Db, gameId: string, releaseId: string): AchievementDef[] | null {
  const row = db
    .select({ defsJson: schema.achievementCatalogs.defsJson })
    .from(schema.achievementCatalogs)
    .where(and(eq(schema.achievementCatalogs.gameId, gameId), eq(schema.achievementCatalogs.releaseId, releaseId)))
    .get();
  return row ? parsedDefinitions(row.defsJson) : null;
}

export function latestCatalog(db: Db, gameId: string): AchievementDef[] | null {
  const row = db
    .select({ defsJson: schema.achievementCatalogs.defsJson })
    .from(schema.achievementCatalogs)
    .where(eq(schema.achievementCatalogs.gameId, gameId))
    .orderBy(desc(schema.achievementCatalogs.registeredAt), desc(schema.achievementCatalogs.releaseId))
    .get();
  return row ? parsedDefinitions(row.defsJson) : null;
}

export function registerCatalog(
  db: Db,
  gameId: string,
  releaseId: string,
  input: readonly AchievementDef[],
  now = new Date().toISOString(),
): void {
  const definitions = AchievementDefSchema.array().parse(input);
  const registered = catalogForRelease(db, gameId, releaseId);
  if (registered) {
    if (JSON.stringify(registered) === JSON.stringify(definitions)) return;
    throw new CatalogLintError([{ code: 'release_conflict', key: releaseId }]);
  }
  const previous = latestCatalog(db, gameId);
  const issues = lintCatalog(previous, definitions);
  if (issues.length > 0) throw new CatalogLintError(issues);

  db.transaction((tx) => {
    const current = new Map(
      tx
        .select()
        .from(schema.achievementDefs)
        .where(eq(schema.achievementDefs.gameId, gameId))
        .all()
        .map((definition) => [definition.key, definition]),
    );

    for (const definition of definitions) {
      const existing = current.get(definition.key);
      tx.insert(schema.achievementDefs)
        .values({
          gameId,
          key: definition.key,
          title: definition.title,
          description: definition.description,
          iconPath: definition.icon,
          hidden: definition.hidden,
          target: definition.progress?.target,
          firstReleaseId: existing?.firstReleaseId ?? releaseId,
          retiredReleaseId: definition.retired === true ? (existing?.retiredReleaseId ?? releaseId) : null,
        })
        .onConflictDoUpdate({
          target: [schema.achievementDefs.gameId, schema.achievementDefs.key],
          set: {
            title: definition.title,
            description: definition.description,
            iconPath: definition.icon,
            hidden: definition.hidden,
            target: definition.progress?.target ?? null,
            retiredReleaseId: definition.retired === true ? (existing?.retiredReleaseId ?? releaseId) : null,
          },
        })
        .run();
    }

    tx.insert(schema.achievementCatalogs)
      .values({ gameId, releaseId, defsJson: JSON.stringify(definitions), registeredAt: now })
      .run();
  });
}

export function copyCatalog(
  db: Db,
  fromGameId: string,
  toGameId: string,
  releaseId: string,
  now = new Date().toISOString(),
  fromReleaseId?: string,
): number {
  const definitions =
    fromReleaseId === undefined ? latestCatalog(db, fromGameId) : catalogForRelease(db, fromGameId, fromReleaseId);
  if (!definitions) return 0;
  registerCatalog(db, toGameId, releaseId, definitions, now);
  return definitions.length;
}
