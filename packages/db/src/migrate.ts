import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Sqlite } from './open.js';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

const migrationFile = /^\d{14}_[a-z0-9_]+\.sql$/;

// Applies `<YYYYMMDDHHmmss>_<name>.sql` files in name order, each in its own transaction,
// recording `migration:<file>` in app_meta. Applied files are never re-run or edited.
export function migrate(input: { sqlite: Sqlite; dir?: string }): { applied: string[] } {
  const { sqlite } = input;
  const dir = input.dir ?? MIGRATIONS_DIR;
  sqlite.exec('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

  const isApplied = sqlite.prepare<[string], { key: string }>('SELECT key FROM app_meta WHERE key = ?');
  const record = sqlite.prepare<[string, string]>('INSERT INTO app_meta (key, value) VALUES (?, ?)');
  const applied: string[] = [];

  for (const file of readdirSync(dir)
    .filter((name) => migrationFile.test(name))
    .sort()) {
    const key = `migration:${file}`;
    if (isApplied.get(key)) continue;

    const sql = readFileSync(`${dir}/${file}`, 'utf8');
    try {
      sqlite.transaction(() => {
        sqlite.exec(sql);
        record.run(key, new Date().toISOString());
      })();
    } catch (error) {
      throw new Error(`migration ${file} failed: ${(error as Error).message}`, { cause: error });
    }
    applied.push(file);
  }

  return { applied };
}
