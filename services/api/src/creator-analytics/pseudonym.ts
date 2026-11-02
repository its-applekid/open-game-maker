import { createHmac, randomBytes } from 'node:crypto';

import { schema, type Db } from '@ogm/db';
import { and, desc, eq, lt } from 'drizzle-orm';

const ROTATION_MS = 30 * 24 * 60 * 60 * 1_000;

type SaltFactory = () => string;
const randomSalt: SaltFactory = () => randomBytes(32).toString('hex');

export function pseudoUserId(salt: string, userId: string): string {
  return createHmac('sha256', Buffer.from(salt, 'hex')).update(userId).digest('hex');
}

export function saltForGame(
  db: Db,
  gameId: string,
  now = new Date().toISOString(),
  makeSalt: SaltFactory = randomSalt,
): string {
  const existing = db
    .select()
    .from(schema.analyticsSalts)
    .where(eq(schema.analyticsSalts.gameId, gameId))
    .orderBy(desc(schema.analyticsSalts.rotatedAt))
    .get();
  if (existing) return existing.salt;

  const salt = makeSalt();
  db.insert(schema.analyticsSalts).values({ gameId, salt, rotatedAt: now }).run();
  return salt;
}

export function pseudonymForUser(db: Db, gameId: string, userId: string, now = new Date().toISOString()): string {
  return pseudoUserId(saltForGame(db, gameId, now), userId);
}

export function rotateDueSalts(db: Db, now = new Date().toISOString(), makeSalt: SaltFactory = randomSalt): number {
  const latest = new Map<string, { rotatedAt: string }>();
  for (const row of db
    .select({ gameId: schema.analyticsSalts.gameId, rotatedAt: schema.analyticsSalts.rotatedAt })
    .from(schema.analyticsSalts)
    .orderBy(desc(schema.analyticsSalts.rotatedAt))
    .all()) {
    if (!latest.has(row.gameId)) latest.set(row.gameId, row);
  }

  const nowMs = Date.parse(now);
  let rotated = 0;
  for (const [gameId, salt] of latest) {
    if (nowMs - Date.parse(salt.rotatedAt) < ROTATION_MS) continue;
    db.insert(schema.analyticsSalts).values({ gameId, salt: makeSalt(), rotatedAt: now }).run();
    rotated += 1;
  }
  return rotated;
}

export function pruneExpiredSalts(db: Db, rawEventCutoff: string): number {
  const rows = db
    .select({ gameId: schema.analyticsSalts.gameId, rotatedAt: schema.analyticsSalts.rotatedAt })
    .from(schema.analyticsSalts)
    .orderBy(schema.analyticsSalts.gameId, desc(schema.analyticsSalts.rotatedAt))
    .all();
  const expired: { gameId: string; rotatedAt: string }[] = [];
  let previousGameId: string | undefined;
  let newerRotation: string | undefined;

  for (const row of rows) {
    if (row.gameId !== previousGameId) {
      previousGameId = row.gameId;
      newerRotation = row.rotatedAt;
      continue;
    }
    if (newerRotation && newerRotation < rawEventCutoff) expired.push(row);
    newerRotation = row.rotatedAt;
  }

  let deleted = 0;
  db.transaction((tx) => {
    for (const row of expired) {
      deleted += tx
        .delete(schema.analyticsSalts)
        .where(
          and(
            eq(schema.analyticsSalts.gameId, row.gameId),
            eq(schema.analyticsSalts.rotatedAt, row.rotatedAt),
            lt(schema.analyticsSalts.rotatedAt, rawEventCutoff),
          ),
        )
        .run().changes;
    }
  });
  return deleted;
}
