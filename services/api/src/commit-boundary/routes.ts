import { Hono } from 'hono';
import type { Context } from 'hono';

import { schema } from '@ogm/db';
import { asc, eq, isNotNull } from 'drizzle-orm';

import { HttpError } from '../app/errors.js';
import { requirePrincipal } from '../app/principal.js';
import type { ApiBindings } from '../app/types.js';

export const prefix = '/internal';

function requireCommitService(c: Context<ApiBindings>): void {
  const principal = requirePrincipal(c, ['service']);
  if (principal.service !== 'commit') throw new HttpError(403, 'forbidden');
}

function personalName(name: string, email: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed.toLocaleLowerCase() === email.toLocaleLowerCase()) return undefined;
  return /\s/u.test(trimmed) ? trimmed : undefined;
}

const routes = new Hono<ApiBindings>()
  .get('/games/active-repos', (c) => {
    requireCommitService(c);
    const repositories = c.get('deps').db
      .select({
        gameId: schema.games.id,
        owner: schema.games.githubOwner,
        name: schema.games.githubRepo,
        visibility: schema.games.repoVisibility,
      })
      .from(schema.games)
      .where(isNotNull(schema.games.githubOwner))
      .orderBy(asc(schema.games.id))
      .all()
      .filter(
        (repo): repo is { gameId: string; owner: string; name: string; visibility: 'private' | 'public' } =>
          repo.owner !== null && repo.name !== null,
      );
    return c.json({ repositories });
  })
  .get('/games/:id/pii-terms', (c) => {
    requireCommitService(c);
    const deps = c.get('deps');
    const game = deps.db
      .select({ familyId: schema.games.familyId })
      .from(schema.games)
      .where(eq(schema.games.id, c.req.param('id')))
      .get();
    if (game === undefined) throw new HttpError(404, 'game_not_found');

    const profiles = deps.db
      .select({ name: schema.user.name, email: schema.user.email })
      .from(schema.familyMembers)
      .innerJoin(schema.user, eq(schema.familyMembers.userId, schema.user.id))
      .where(eq(schema.familyMembers.familyId, game.familyId))
      .orderBy(asc(schema.user.name))
      .all();
    const terms = [
      ...new Set(
        profiles.flatMap(({ name, email }) => {
          const profileName = personalName(name, email);
          return profileName === undefined ? [email] : [profileName, email];
        }),
      ),
    ];
    return c.json({ terms });
  });

export default routes;
