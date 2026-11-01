import { describe, expect, it } from 'vitest';

import { migrate } from '../src/migrate.js';
import { openDb } from '../src/open.js';
import { notifications, pushSubscriptions } from '../src/schema/index.js';

describe('notification schema', () => {
  it('migrates the notification tables and enforces unique push endpoints', () => {
    const { db, sqlite } = openDb(':memory:');
    migrate({ sqlite });

    db.insert(pushSubscriptions)
      .values({
        id: 'ps_one',
        userId: 'u_one',
        endpoint: 'https://push.example.test/one',
        p256dh: 'p256dh',
        auth: 'auth',
        createdAt: '2026-11-01T12:00:00.000Z',
      })
      .run();

    expect(() =>
      db
        .insert(pushSubscriptions)
        .values({
          id: 'ps_two',
          userId: 'u_two',
          endpoint: 'https://push.example.test/one',
          p256dh: 'other-p256dh',
          auth: 'other-auth',
          createdAt: '2026-11-01T12:00:01.000Z',
        })
        .run(),
    ).toThrow(/UNIQUE constraint failed/);

    db.insert(notifications)
      .values({
        id: 'n_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e05',
        userId: 'u_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e03',
        kind: 'build.done',
        title: 'Your build is ready',
        body: 'g_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e01',
        createdAt: '2026-11-01T12:00:02.000Z',
      })
      .run();
    expect(db.select().from(notifications).all()).toHaveLength(1);

    sqlite.close();
  });
});
