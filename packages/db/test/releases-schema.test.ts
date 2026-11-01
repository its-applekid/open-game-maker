import { describe, expect, it } from 'vitest';

import { migrate } from '../src/migrate.js';
import { openDb } from '../src/open.js';

describe('release schema', () => {
  it('migrates builds, snapshots, releases, notes, and the published pointer', () => {
    const { sqlite } = openDb(':memory:');
    migrate({ sqlite });

    const tables = sqlite
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map(({ name }) => name);
    const gameColumns = sqlite.prepare<[], { name: string }>('PRAGMA table_info(games)').all();

    expect(tables).toEqual(expect.arrayContaining(['builds', 'override_snapshots', 'releases', 'change_notes']));
    expect(gameColumns.map(({ name }) => name)).toContain('published_release_id');
    sqlite.close();
  });

  it('enforces one release sequence per game and keeps releases append-only', () => {
    const { sqlite } = openDb(':memory:');
    migrate({ sqlite });
    sqlite.exec(`
      INSERT INTO families (id, name, owner_user_id, friends_allowed, created_at)
      VALUES ('f_1', 'Family', 'u_1', 0, '2026-11-01T00:00:00.000Z');
      INSERT INTO games (id, family_id, owner_id, title, visibility, repo_visibility, created_at)
      VALUES ('g_1', 'f_1', 'u_1', 'Game', 'private', 'private', '2026-11-01T00:00:00.000Z');
      INSERT INTO branches (id, game_id, name, git_ref, head_rev, status, created_by, created_at)
      VALUES ('br_1', 'g_1', 'main', 'refs/heads/main', 0, 'active', 'u_1', '2026-11-01T00:00:00.000Z');
      INSERT INTO builds
        (id, game_id, branch_id, git_sha, sdk_version, save_schema_version, achievement_catalog_hash, status, artifact, artifact_path, created_at)
      VALUES
        ('bld_1', 'g_1', 'br_1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '1.0.0', 1,
         'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'tested', 'present', '/artifacts/bld_1',
         '2026-11-01T00:00:00.000Z');
      INSERT INTO override_snapshots
        (id, game_id, branch_id, build_id, head_rev, sha256, entries_json, entity_ops_json, fold_sha, created_at)
      VALUES
        ('snap_1', 'g_1', 'br_1', 'bld_1', 0,
         'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', '{}', '{}',
         'dddddddddddddddddddddddddddddddddddddddd', '2026-11-01T00:00:00.000Z');
      INSERT INTO releases
        (id, game_id, seq, version, build_id, snapshot_id, git_tag, kind, changelog_json, published_by, published_at)
      VALUES
        ('rel_1', 'g_1', 1, '1.0.0', 'bld_1', 'snap_1', 'gm/g_1/v1.0.0', 'publish', '{}', 'u_1',
         '2026-11-01T00:00:00.000Z');
    `);

    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO releases
            (id, game_id, seq, version, build_id, snapshot_id, git_tag, kind, changelog_json, published_by, published_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('rel_2', 'g_1', 1, '2.0.0', 'bld_1', 'snap_1', 'gm/g_1/v2.0.0', 'publish', '{}', 'u_1', 'now'),
    ).toThrow(/UNIQUE constraint failed/);
    expect(() => sqlite.prepare("UPDATE releases SET version = 'changed' WHERE id = 'rel_1'").run()).toThrow(
      /append-only/,
    );
    expect(() => sqlite.prepare("DELETE FROM releases WHERE id = 'rel_1'").run()).toThrow(/append-only/);
    sqlite.close();
  });
});
