import { describe, expect, it } from 'vitest';

import { migrate } from '../src/migrate.js';
import { openDb } from '../src/open.js';
import {
  achievementAwards,
  achievementCatalogs,
  achievementDefs,
  achievementProgress,
  analyticsSalts,
  creatorAnalyticsDaily,
  creatorAnalyticsEvents,
} from '../src/schema/index.js';

describe('achievement and creator analytics storage', () => {
  it('migrates both contexts and keeps duplicate awards idempotent', () => {
    const { db, sqlite } = openDb(':memory:');
    const applied = migrate({ sqlite }).applied;

    expect(applied.some((file) => file.endsWith('_achievements.sql'))).toBe(true);
    expect(applied.some((file) => file.endsWith('_creator_analytics.sql'))).toBe(true);
    expect(db.select().from(achievementDefs).all()).toEqual([]);
    expect(db.select().from(achievementCatalogs).all()).toEqual([]);
    expect(db.select().from(achievementAwards).all()).toEqual([]);
    expect(db.select().from(achievementProgress).all()).toEqual([]);
    expect(db.select().from(creatorAnalyticsEvents).all()).toEqual([]);
    expect(db.select().from(creatorAnalyticsDaily).all()).toEqual([]);
    expect(db.select().from(analyticsSalts).all()).toEqual([]);

    sqlite.exec("INSERT INTO families VALUES ('f', 'Family', 'u', 0, 'now')");
    sqlite.exec(
      "INSERT INTO games (id, family_id, owner_id, title, visibility, repo_visibility, created_at) VALUES ('g', 'f', 'u', 'Game', 'listed', 'private', 'now')",
    );
    sqlite.exec(
      "INSERT INTO achievement_defs VALUES ('g', 'first', 'First', 'First award', 'icon.png', 0, NULL, 'r1', NULL)",
    );
    const insert = sqlite.prepare(
      "INSERT OR IGNORE INTO achievement_awards VALUES ('u', 'g', 'first', 'r1', 'client', 'now')",
    );

    expect(insert.run().changes).toBe(1);
    expect(insert.run().changes).toBe(0);
    sqlite.close();
  });

  it('enforces analytics environment, outcome, and props-size constraints', () => {
    const { sqlite } = openDb(':memory:');
    migrate({ sqlite });
    sqlite.exec("INSERT INTO families VALUES ('f', 'Family', 'u', 0, 'now')");
    sqlite.exec(
      "INSERT INTO games (id, family_id, owner_id, title, visibility, repo_visibility, created_at) VALUES ('g', 'f', 'u', 'Game', 'listed', 'private', 'now')",
    );

    const insert = sqlite.prepare(
      `INSERT INTO creator_analytics_events
       (id, ts, game_id, branch_id, release_id, env, pseudo_user_id, session_id, name, scope, marker, outcome, props_json)
       VALUES (?, '2026-11-01T00:00:00.000Z', 'g', 'b', NULL, ?, 'p', 's', 'complete', NULL, NULL, ?, ?)`,
    );

    expect(() => insert.run('e-bad-env', 'preview', null, '{}')).toThrow();
    expect(() => insert.run('e-bad-outcome', 'published', 'won', '{}')).toThrow();
    expect(() => insert.run('e-large', 'published', null, JSON.stringify({ x: 'a'.repeat(1_025) }))).toThrow();
    expect(() => insert.run('e-multibyte', 'published', null, JSON.stringify({ x: '🎮'.repeat(300) }))).toThrow();
    expect(insert.run('e-ok', 'draft', null, '{}').changes).toBe(1);
    sqlite.close();
  });
});
