import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { MIGRATIONS_DIR, migrate } from '../src/migrate.js';
import { openDb } from '../src/open.js';

const migration = '20261103023559_games_forked_from.sql';
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('fork provenance schema', () => {
  it('upgrades existing games without losing child rows and keeps provenance immutable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ogm-fork-schema-'));
    dirs.push(dir);
    for (const file of readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.sql') && file < migration)) {
      copyFileSync(join(MIGRATIONS_DIR, file), join(dir, file));
    }
    const { sqlite } = openDb(':memory:');
    migrate({ sqlite, dir });
    sqlite.exec(`
      INSERT INTO families (id, name, owner_user_id, created_at)
      VALUES ('f_1', 'Family', 'u_1', '2026-11-02T00:00:00.000Z');
      INSERT INTO games (id, family_id, owner_id, title, visibility, repo_visibility, created_at)
      VALUES ('g_source', 'f_1', 'u_1', 'Source', 'listed', 'public', '2026-11-02T00:00:00.000Z');
      INSERT INTO branches (id, game_id, name, git_ref, head_rev, status, created_by, created_at)
      VALUES ('b_1', 'g_source', 'main', 'refs/heads/main', 0, 'active', 'u_1', '2026-11-02T00:00:00.000Z');
    `);
    copyFileSync(join(MIGRATIONS_DIR, migration), join(dir, migration));
    expect(migrate({ sqlite, dir })).toEqual({ applied: [migration] });
    sqlite.exec(`
      INSERT INTO games
        (id, family_id, owner_id, title, visibility, repo_visibility, forked_from_game_id,
         forked_from_release_id, created_at)
      VALUES
        ('g_fork', 'f_1', 'u_1', 'Fork', 'private', 'private', 'g_source', 'rel_1',
         '2026-11-02T00:00:00.000Z');
    `);

    const columns = sqlite
      .prepare<[], { name: string }>('PRAGMA table_info(games)')
      .all()
      .map(({ name }) => name);
    expect(columns).toEqual(expect.arrayContaining(['forked_from_game_id', 'forked_from_release_id', 'forkable']));
    expect(sqlite.prepare<[], { forkable: number }>("SELECT forkable FROM games WHERE id = 'g_source'").get()).toEqual({
      forkable: 1,
    });
    expect(sqlite.prepare<[], { count: number }>('SELECT count(*) AS count FROM branches').get()).toEqual({ count: 1 });
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(() => sqlite.prepare("UPDATE games SET forked_from_release_id = 'rel_2' WHERE id = 'g_fork'").run()).toThrow(
      /fork provenance is immutable/,
    );
    expect(() => sqlite.prepare("UPDATE games SET forkable = 2 WHERE id = 'g_source'").run()).toThrow(/CHECK/);

    sqlite.prepare("UPDATE games SET title = 'Renamed fork' WHERE id = 'g_fork'").run();
    expect(sqlite.prepare<[], { title: string }>("SELECT title FROM games WHERE id = 'g_fork'").get()).toEqual({
      title: 'Renamed fork',
    });
    sqlite.close();
  });
});
