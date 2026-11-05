import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { MIGRATIONS_DIR, migrate } from '../src/migrate.js';
import { openDb } from '../src/open.js';

const migration = '20261105220609_game_slugs.sql';
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('game slug schema', () => {
  it('gives every existing game a unique slug and retires the slugs it has outgrown', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ogm-slug-schema-'));
    dirs.push(dir);
    for (const file of readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.sql') && file < migration)) {
      copyFileSync(join(MIGRATIONS_DIR, file), join(dir, file));
    }
    const { sqlite } = openDb(':memory:');
    migrate({ sqlite, dir });
    sqlite.exec(`
      INSERT INTO families (id, name, owner_user_id, created_at)
      VALUES ('f_1', 'Family', 'u_1', '2026-11-05T00:00:00.000Z');
      INSERT INTO games (id, family_id, owner_id, title, visibility, repo_visibility, created_at)
      VALUES
        ('g_aaaa1111', 'f_1', 'u_1', 'Castle Game', 'listed', 'private', '2026-11-05T00:00:00.000Z'),
        ('g_bbbb2222', 'f_1', 'u_1', 'Castle Game', 'listed', 'private', '2026-11-05T00:00:00.000Z');
    `);
    copyFileSync(join(MIGRATIONS_DIR, migration), join(dir, migration));
    expect(migrate({ sqlite, dir })).toEqual({ applied: [migration] });

    expect(
      sqlite.prepare<[], { id: string; slug: string | null }>('SELECT id, slug FROM games ORDER BY id').all(),
    ).toEqual([
      { id: 'g_aaaa1111', slug: 'game-aaaa1111' },
      { id: 'g_bbbb2222', slug: 'game-bbbb2222' },
    ]);

    expect(() => sqlite.prepare("UPDATE games SET slug = 'game-aaaa1111' WHERE id = 'g_bbbb2222'").run()).toThrow(
      /UNIQUE/,
    );
    expect(
      sqlite.prepare<[], { count: number }>('SELECT count(*) AS count FROM games WHERE slug IS NULL').get(),
    ).toEqual({ count: 0 });

    sqlite
      .prepare(
        `INSERT INTO game_slugs (slug, game_id, created_at)
         VALUES ('castle-game', 'g_aaaa1111', '2026-11-05T00:00:00.000Z')`,
      )
      .run();
    expect(
      sqlite.prepare<[], { slug: string }>("SELECT slug FROM game_slugs WHERE game_id = 'g_aaaa1111'").get(),
    ).toEqual({ slug: 'castle-game' });
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    sqlite.close();
  });
});
