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
import { CommitServiceInstallationLookup, GitHubOAuthUnavailableError } from './installations.js';

export const prefix = '/api/v1';

export function setup(deps: AppDeps): void {
  deps.registry.githubInstallations ??= new CommitServiceInstallationLookup({
    baseUrl: deps.config.commitInternalUrl,
    token: deps.config.commitServiceToken,
  });
}

// The installation id GitHub appends to the App's setup URL and the OAuth code it appends beside it. The login is
// never taken from the browser; the code is what proves the signed-in creator controls that GitHub account.
const connectBody = z
  .object({
    installationId: z.string().regex(/^[1-9][0-9]{0,14}$/u),
    code: z.string().regex(/^[A-Za-z0-9_-]{1,255}$/u),
  })
  .strict();

const routes = new Hono<ApiBindings>()
  .get('/github/connection', async (c) => {
    const principal = requirePrincipal(c, ['user']);
    const deps = c.get('deps');
    const connection = deps.db
      .select({ login: schema.githubConnections.login, installationId: schema.githubConnections.installationId })
      .from(schema.githubConnections)
      .where(eq(schema.githubConnections.userId, principal.userId))
      .get();
    if (!connection) return c.json({ connected: false });

    // A stored row goes stale when the App is uninstalled or access is revoked, and a renamed account keeps the
    // old login. Revalidate so the screen stops claiming "Connected" while provisioning would fail.
    const lookup = deps.registry.githubInstallations;
    if (!lookup) return c.json({ connected: true, login: connection.login });

    let login: string | null;
    try {
      login = await lookup.revalidate(connection.installationId);
    } catch (error) {
      // A GitHub or commit-service outage must not read as "you disconnected": report the stored connection.
      deps.log({ event: 'github-connection-revalidate-failed', error: (error as Error).message });
      return c.json({ connected: true, login: connection.login });
    }
    if (login === null) {
      deps.db.delete(schema.githubConnections).where(eq(schema.githubConnections.userId, principal.userId)).run();
      return c.json({ connected: false });
    }
    if (login !== connection.login) {
      deps.db
        .update(schema.githubConnections)
        .set({ login })
        .where(eq(schema.githubConnections.userId, principal.userId))
        .run();
    }
    return c.json({ connected: true, login });
  })
  .post('/github/connect', async (c) => {
    const principal = requirePrincipal(c, ['user']);
    requireAuthorization(authorize(actorFromPrincipal(principal), 'game.create', { familyId: principal.familyId }));
    const { installationId, code } = await parseBody(c, connectBody);
    const deps = c.get('deps');
    const lookup = deps.registry.githubInstallations;
    if (!lookup) throw new HttpError(503, 'github_lookup_unavailable');

    let login: string | null;
    try {
      login = await lookup.loginFor(installationId, code);
    } catch (error) {
      deps.log({ event: 'github-installation-lookup-failed', error: (error as Error).message });
      if (error instanceof GitHubOAuthUnavailableError) throw new HttpError(503, 'github_oauth_unavailable');
      throw new HttpError(502, 'github_lookup_failed');
    }
    // A code the user spent already, or one that does not list this installation, is answered as not found so a
    // stranger cannot tell "exists but is not yours" from "does not exist".
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
