#!/usr/bin/env node
// Consistent online snapshot of a WAL SQLite database without the sqlite3 CLI.
// usage: node --no-warnings sqlite-backup.mjs <src.db> <out.sqlite>
// exit 0 snapshot written (or no database yet), 1 error, 2 out already exists
import { existsSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  process.stderr.write('usage: sqlite-backup.mjs <src.db> <out.sqlite>\n');
  process.exit(1);
}
if (!existsSync(src)) {
  process.stdout.write(`no database yet: ${src}\n`);
  process.exit(0);
}
if (existsSync(out)) {
  process.stderr.write(`refusing to overwrite ${out}\n`);
  process.exit(2);
}

try {
  const db = new DatabaseSync(src);
  try {
    db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
  process.stdout.write(`snapshot ${statSync(out).size} bytes\n`);
} catch (error) {
  process.stderr.write(`snapshot failed: ${error.message}\n`);
  process.exit(1);
}
