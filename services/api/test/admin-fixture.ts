import { schema } from '@ogm/db';

import { asUser, installUsers, makeApp, makeDeps, type TestUser } from './helpers.js';

const T0 = '2026-11-01T00:00:00.000Z';

const user = (userId: string, familyId: string, admin: boolean, capability: 'creator' | 'player'): TestUser => ({
  kind: 'user',
  userId,
  displayName: userId,
  email: `${userId}@example.com`,
  familyId,
  platformRole: admin ? 'admin' : 'none',
  capability,
});

// Family X: owner, a peer admin, a creator and a player. Family Y: its own owner-admin.
export const X = {
  family: 'f-x',
  owner: user('u-owner', 'f-x', true, 'creator'),
  admin: user('u-admin', 'f-x', true, 'creator'),
  admin2: user('u-admin2', 'f-x', true, 'creator'),
  creator: user('u-creator', 'f-x', false, 'creator'),
  player: user('u-player', 'f-x', false, 'player'),
  game: 'g-x',
  invite: 'i-x',
  mail: 'm-x',
};
export const Y = { family: 'f-y', admin: user('u-yadmin', 'f-y', true, 'creator'), game: 'g-y' };

export async function seededApp() {
  const deps = makeDeps();
  installUsers(deps, [X.owner, X.admin, X.admin2, X.creator, X.player, Y.admin]);
  deps.db
    .insert(schema.families)
    .values([
      { id: X.family, name: 'X', ownerUserId: X.owner.userId, createdAt: T0 },
      { id: Y.family, name: 'Y', ownerUserId: Y.admin.userId, createdAt: T0 },
    ])
    .run();
  const member = (u: TestUser, role: 'owner' | 'admin' | 'member') => ({
    familyId: u.familyId,
    userId: u.userId,
    role,
    capability: u.capability,
    joinedAt: T0,
  });
  deps.db
    .insert(schema.familyMembers)
    .values([
      member(X.owner, 'owner'),
      member(X.admin, 'admin'),
      member(X.admin2, 'admin'),
      member(X.creator, 'member'),
      member(X.player, 'member'),
      member(Y.admin, 'owner'),
    ])
    .run();
  deps.db
    .insert(schema.games)
    .values([
      {
        id: X.game,
        familyId: X.family,
        ownerId: X.creator.userId,
        title: 'X game',
        visibility: 'listed',
        repoVisibility: 'private',
        createdAt: T0,
      },
      {
        id: Y.game,
        familyId: Y.family,
        ownerId: Y.admin.userId,
        title: 'Y game',
        visibility: 'listed',
        repoVisibility: 'private',
        createdAt: T0,
      },
    ])
    .run();
  deps.db
    .insert(schema.invitations)
    .values({
      id: X.invite,
      familyId: X.family,
      kind: 'member',
      email: 'friend@example.com',
      tokenHash: 'hash-x',
      capability: 'player',
      inviterId: X.owner.userId,
      expiresAt: '2099-01-01T00:00:00.000Z',
      createdAt: T0,
    })
    .run();
  deps.db
    .insert(schema.mailOutbox)
    .values({ id: X.mail, to: 'friend@example.com', subject: 'Invite', text: 'https://x/join/t', createdAt: T0 })
    .run();
  const { app } = await makeApp(deps);

  const call = (actor: TestUser, method: string, path: string, body?: unknown) =>
    app.request(`/api/v1/admin${path}`, {
      method,
      headers: { ...asUser(actor.userId), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { app, deps, call };
}
