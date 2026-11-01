import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { migrate } from '../src/migrate.js';
import { openDb } from '../src/open.js';
import { appMeta } from '../src/schema/index.js';

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ogm-migrate-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('migrate', () => {
  it('applies the shipped migrations once and records them', () => {
    const { sqlite, db } = openDb(join(tempDir(), 'ogm.sqlite3'));
    expect(migrate({ sqlite })).toEqual({
      applied: [
        '20261101000000_app_meta.sql',
        '20261101040000_notify.sql',
        '20261101114708_game_daemons.sql',
      ],
    });
    expect(migrate({ sqlite })).toEqual({ applied: [] });
    expect(
      db
        .select()
        .from(appMeta)
        .all()
        .map(({ key }) => key),
    ).toEqual([
      'migration:20261101000000_app_meta.sql',
      'migration:20261101040000_notify.sql',
      'migration:20261101114708_game_daemons.sql',
    ]);
    sqlite.close();
  });

  it('applies files in name order and ignores files that are not timestamped migrations', () => {
    const dir = tempDir();
    writeFileSync(join(dir, '20261102000000_b.sql'), 'CREATE TABLE b (id INTEGER PRIMARY KEY REFERENCES a(id));');
    writeFileSync(join(dir, '20261101000000_a.sql'), 'CREATE TABLE a (id INTEGER PRIMARY KEY);');
    writeFileSync(join(dir, 'notes.sql'), 'DROP TABLE app_meta;');
    const { sqlite } = openDb(':memory:');
    expect(migrate({ sqlite, dir }).applied).toEqual(['20261101000000_a.sql', '20261102000000_b.sql']);
    sqlite.close();
  });

  it('rolls back and names the file when a migration fails', () => {
    const dir = tempDir();
    writeFileSync(join(dir, '20261101000000_ok.sql'), 'CREATE TABLE ok (id INTEGER);');
    writeFileSync(join(dir, '20261102000000_bad.sql'), 'CREATE TABLE half (id INTEGER); CREATE TABLEX broken;');
    const { sqlite } = openDb(':memory:');
    expect(() => migrate({ sqlite, dir })).toThrow(/20261102000000_bad\.sql/);
    const keys = sqlite.prepare('SELECT key FROM app_meta').pluck().all();
    expect(keys).toEqual(['migration:20261101000000_ok.sql']);
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'half'").get()).toBeUndefined();
    sqlite.close();
  });
});
