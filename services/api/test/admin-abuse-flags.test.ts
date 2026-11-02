import { schema } from '@ogm/db';
import { describe, expect, it } from 'vitest';

import { seededApp, X, Y } from './admin-fixture.js';
import { installUsers, type TestUser } from './helpers.js';

const maintainer: TestUser = {
  kind: 'user',
  userId: 'u-maintainer',
  displayName: 'Maintainer',
  email: 'maintainer@example.com',
  familyId: X.family,
  platformRole: 'maintainer',
  capability: 'creator',
};

describe('admin game abuse flags', () => {
  it('records a bounded flag and returns the typed confirmation', async () => {
    const { deps, call } = await seededApp();

    const response = await call(X.admin, 'POST', `/games/${X.game}/flag-abuse`, { reason: 'harmful' });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { flag: Record<string, unknown> };
    expect(body).toEqual({
      flag: {
        id: expect.any(String),
        gameId: X.game,
        reason: 'harmful',
        createdAt: expect.any(String),
      },
    });
    expect(deps.db.select().from(schema.gameAbuseFlags).all()).toEqual([
      {
        id: body.flag.id,
        gameId: X.game,
        familyId: X.family,
        flaggedBy: X.admin.userId,
        reason: 'harmful',
        createdAt: body.flag.createdAt,
      },
    ]);
  });

  it('admits a maintainer but rejects an ordinary member and another family', async () => {
    const { deps, call } = await seededApp();
    installUsers(deps, [maintainer]);
    deps.db
      .insert(schema.familyMembers)
      .values({
        familyId: X.family,
        userId: maintainer.userId,
        role: 'member',
        capability: maintainer.capability,
        joinedAt: new Date().toISOString(),
      })
      .run();

    expect((await call(maintainer, 'POST', `/games/${X.game}/flag-abuse`, { reason: 'spam' })).status).toBe(201);
    expect((await call(X.player, 'POST', `/games/${X.game}/flag-abuse`, { reason: 'spam' })).status).toBe(403);
    expect((await call(Y.admin, 'POST', `/games/${X.game}/flag-abuse`, { reason: 'spam' })).status).toBe(404);
    expect(deps.db.select().from(schema.gameAbuseFlags).all()).toHaveLength(1);
  });

  it('rejects unknown reasons and arbitrary client fields', async () => {
    const { deps, call } = await seededApp();

    expect((await call(X.admin, 'POST', `/games/${X.game}/flag-abuse`, { reason: 'copyright' })).status).toBe(400);
    expect(
      (
        await call(X.admin, 'POST', `/games/${X.game}/flag-abuse`, {
          reason: 'other',
          prompt: 'do not persist me',
        })
      ).status,
    ).toBe(400);
    expect(deps.db.select().from(schema.gameAbuseFlags).all()).toEqual([]);
  });
});
