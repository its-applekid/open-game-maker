import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate, useLocation, type RouteObject } from 'react-router';

import { useSession } from '../lib/api/session';
import type { ScreenRoute } from './screen';

type ScreenModule = { route?: ScreenRoute };

const modules = import.meta.glob<ScreenModule>('../routes/*/route.tsx', {
  eager: true,
});

export const screenRouteObjects = collectScreenRoutes(modules);
export type AppRouter = ReturnType<typeof createBrowserRouter>;

export function createAppRouter() {
  return createBrowserRouter(screenRouteObjects);
}

export function collectScreenRoutes(routeModules: Record<string, ScreenModule>): RouteObject[] {
  return Object.entries(routeModules)
    .map(([filename, module]) => {
      if (!module.route) {
        throw new Error(`${filename} must export a route`);
      }

      return module.route;
    })
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((screen) => {
      let element = screen.element;

      if (screen.chrome === 'app') {
        element = <AppChrome>{element}</AppChrome>;
      }
      if (screen.auth === 'required') {
        element = <RequireSession>{element}</RequireSession>;
      }

      return {
        path: screen.path,
        element,
        children: screen.children?.map((child) => ({
          path: child.path,
          element: child.element,
        })),
      };
    });
}

function RequireSession({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();

  if (session === null) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate replace to={`/signin?next=${next}`} />;
  }

  return children;
}

function AppChrome({ children }: { children: ReactNode }) {
  return (
    <div className="app-chrome">
      <div id="app-logo-slot" aria-hidden="true" />
      <main>{children}</main>
      <div id="bug-fab-slot" aria-hidden="true" />
      <div id="chat-dock-slot" aria-hidden="true" />
    </div>
  );
}
