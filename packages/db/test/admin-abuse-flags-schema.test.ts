import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { migrate, openDb, schema } from '../src/index.js';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('game abuse flag schema', () => {
  it('chains the generated migration after scope revisions at journal index 22', () => {
    const journal = JSON.parse(readFileSync(new URL('../migrations/meta/_journal.json', import.meta.url), 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const previous = JSON.parse(
      readFileSync(new URL('../migrations/meta/20261102092046_snapshot.json', import.meta.url), 'utf8'),
    ) as { id: string };
    const snapshot = JSON.parse(
      readFileSync(new URL('../migrations/meta/20261102095719_snapshot.json', import.meta.url), 'utf8'),
    ) as { prevId: string };

    expect(journal.entries.at(-1)).toMatchObject({ idx: 22, tag: '20261102095719_game_abuse_flags' });
    expect(snapshot.prevId).toBe(previous.id);
  });

  it('keeps only bounded flag metadata across a database restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ogm-abuse-flags-'));
    dirs.push(dir);
    const path = join(dir, 'ogm.sqlite3');
    const first = openDb(path);
    migrate({ sqlite: first.sqlite });
    first.sqlite.exec(`
      INSERT INTO families (id, name, owner_user_id, created_at)
      VALUES ('f_1', 'Family', 'u_1', 'now');
      INSERT INTO games (id, family_id, owner_id, title, visibility, repo_visibility, created_at)
      VALUES ('g_1', 'f_1', 'u_1', 'Game', 'private', 'private', 'now');
    `);
    first.db
      .insert(schema.gameAbuseFlags)
      .values({
        id: 'flag_1',
        gameId: 'g_1',
        familyId: 'f_1',
        flaggedBy: 'u_admin',
        reason: 'other',
        createdAt: '2026-11-02T09:00:00.000Z',
      })
      .run();
    first.sqlite.close();

    const second = openDb(path);
    expect(second.db.select().from(schema.gameAbuseFlags).get()).toEqual({
      id: 'flag_1',
      gameId: 'g_1',
      familyId: 'f_1',
      flaggedBy: 'u_admin',
      reason: 'other',
      createdAt: '2026-11-02T09:00:00.000Z',
    });
    expect(() =>
      second.sqlite
        .prepare(
          `INSERT INTO game_abuse_flags
             (id, game_id, family_id, flagged_by, reason, created_at)
           VALUES ('flag_2', 'g_1', 'f_1', 'u_admin', 'copyright', 'now')`,
        )
        .run(),
    ).toThrow(/game_abuse_flags_reason_check/);
    second.sqlite.close();
  });
});
