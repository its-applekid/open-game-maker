import { schema, type Db } from '@ogm/db';
import { eq } from 'drizzle-orm';

import type { DaemonRow, DaemonStore } from './types.js';

const { gameDaemons } = schema;

function toRow(record: typeof gameDaemons.$inferSelect): DaemonRow {
  return { ...record, maxConcurrentAgents: record.maxConcurrentAgents === 2 ? 2 : 1 };
}

export function createDbDaemonStore(db: Db): DaemonStore {
  return {
    async byRepo(repo) {
      const record = db.select().from(gameDaemons).where(eq(gameDaemons.repo, repo)).get();
      return record ? toRow(record) : undefined;
    },
    async list() {
      return db.select().from(gameDaemons).orderBy(gameDaemons.port).all().map(toRow);
    },
    async insert(row) {
      db.insert(gameDaemons).values(row).run();
    },
    async update(slug, patch) {
      const record = db.update(gameDaemons).set(patch).where(eq(gameDaemons.slug, slug)).returning().get();
      if (!record) throw new Error(`no game daemon ${slug}`);
      return toRow(record);
    },
  };
}
