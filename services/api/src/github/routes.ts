import { Hono } from 'hono';
import { z } from 'zod';

import { schema } from '@ogm/db';
import { authorize } from '@ogm/policy';
import { and, eq, ne } from 'drizzle-orm';

import { actorFromPrincipal, requireAuthorization } from '../accounts/families.js';
import { HttpError } from '../app/errors.js';
import { requirePrincipal } from '../app/principal.js';
import type { ApiBindings, AppDeps } from '../app/types.js';
import { parseBody } from '../app/validate.js';
import { CommitServiceInstallationLookup } from './installations.js';

export const prefix = '/api/v1';

export function setup(deps: AppDeps): void {
  deps.registry.githubInstallations ??= new CommitServiceInstallationLookup({
    baseUrl: deps.config.commitInternalUrl,
    token: deps.config.commitServiceToken,
  });
}

// The installation id GitHub appends to the App's setup URL; the login is never taken from the browser.
const connectBody = z.object({ installationId: z.string().regex(/^[1-9][0-9]{0,15}$/u) }).strict();

const routes = new Hono<ApiBindings>()
  .get('/github/connection', (c) => {
    const principal = requirePrincipal(c, ['user']);
    const connection = c
      .get('deps')
      .db.select({ login: schema.githubConnections.login })
      .from(schema.githubConnections)
      .where(eq(schema.githubConnections.userId, principal.userId))
      .get();
    return c.json(connection ? { connected: true, login: connection.login } : { connected: false });
  })
  .post('/github/connect', async (c) => {
    const principal = requirePrincipal(c, ['user']);
    requireAuthorization(authorize(actorFromPrincipal(principal), 'game.create', { familyId: principal.familyId }));
    const { installationId } = await parseBody(c, connectBody);
    const deps = c.get('deps');
    const lookup = deps.registry.githubInstallations;
    if (!lookup) throw new HttpError(503, 'github_lookup_unavailable');

    let login: string | null;
    try {
      login = await lookup.loginFor(installationId);
    } catch (error) {
      deps.log({ event: 'github-installation-lookup-failed', error: (error as Error).message });
      throw new HttpError(502, 'github_lookup_failed');
    }
    if (login === null) throw new HttpError(404, 'github_installation_not_found');

    // An installation id travels through the browser, so one already linked to another creator is refused.
    const claimed = deps.db
      .select({ userId: schema.githubConnections.userId })
      .from(schema.githubConnections)
      .where(
        and(
          eq(schema.githubConnections.installationId, installationId),
          ne(schema.githubConnections.userId, principal.userId),
        ),
      )
      .get();
    if (claimed) throw new HttpError(409, 'github_installation_in_use');

    const connectedAt = new Date().toISOString();
    deps.db
      .insert(schema.githubConnections)
      .values({ userId: principal.userId, login, installationId, connectedAt })
      .onConflictDoUpdate({ target: schema.githubConnections.userId, set: { login, installationId, connectedAt } })
      .run();
    return c.json({ connected: true, login });
  });

export default routes;
