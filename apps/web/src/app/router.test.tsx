import { matchRoutes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { collectScreenRoutes, screenRouteObjects } from './router';
import type { ScreenRoute } from './screen';

const routeTable = [
  '/',
  '/age',
  '/signin',
  '/connect/github',
  '/games',
  '/new',
  '/g/game-1',
  '/g/game-1/versions',
  '/g/game-1/releases',
  '/join/invite-1',
  '/admin',
  '/admin/members',
  '/admin/invites',
  '/admin/budgets',
  '/admin/builds',
  '/admin/intake',
  '/settings',
];

describe('screen route collection', () => {
  it.each(routeTable)('resolves %s through a screen module', (path) => {
    expect(matchRoutes(screenRouteObjects, path)).not.toBeNull();
  });

  it('collects a fixture screen from the glob result without router edits', () => {
    const fixture: ScreenRoute = {
      path: '/fixture',
      element: <h1>Fixture</h1>,
      chrome: 'bare',
      auth: 'none',
    };

    const routes = collectScreenRoutes({
      '../routes/__fixture__/route.tsx': { route: fixture },
    });

    expect(matchRoutes(routes, '/fixture')).not.toBeNull();
  });

  it('names a module that omits its route export', () => {
    expect(() => collectScreenRoutes({ '../routes/broken/route.tsx': {} })).toThrow('../routes/broken/route.tsx');
  });
});
