import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, matchRoutes, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { collectScreenRoutes, screenRouteObjects } from './router';
import type { ScreenRoute } from './screen';

const captureError = vi.hoisted(() => vi.fn());

vi.mock('../features/bug-report', () => ({
  BugButton: () => null,
  captureError,
}));

vi.mock('../features/build-chat/BuildChatDock', () => ({
  BuildChatDock: () => <button type="button">Build chat</button>,
}));

vi.mock('../lib/notify', () => ({
  Toasts: () => null,
  useNotificationFeed: () => undefined,
}));

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
  afterEach(() => {
    cleanup();
    captureError.mockReset();
    vi.restoreAllMocks();
  });

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

  it('keeps the chat dock mounted when a screen render crashes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const routes = collectScreenRoutes({
      '../routes/games/route.tsx': {
        route: {
          path: '/games',
          element: <BrokenPicker />,
          chrome: 'app',
          auth: 'none',
        },
      },
      '../routes/new/route.tsx': {
        route: {
          path: '/new',
          element: <h1>New game</h1>,
          chrome: 'app',
          auth: 'none',
        },
      },
      '../routes/game/route.tsx': {
        route: {
          path: '/g/:gameId',
          element: <BrokenPicker />,
          chrome: 'app',
          auth: 'none',
        },
      },
    });
    const router = createMemoryRouter(routes, { initialEntries: ['/games?spotlight=g_1'] });

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeVisible();
    expect(document.querySelector('#chat-dock-slot')).toContainElement(
      screen.getByRole('button', { name: 'Build chat' }),
    );
    await waitFor(() =>
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), { route: '/games', gameId: 'g_1' }),
    );

    await router.navigate('/new');
    expect(await screen.findByRole('heading', { name: 'New game' })).toBeVisible();

    captureError.mockClear();
    await router.navigate('/g/g_2');
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeVisible();
    await waitFor(() =>
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), { route: '/g/g_2', gameId: 'g_2' }),
    );
  }, 10_000);

  it('retries a crashed screen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let crashing = true;
    function RecoverableScreen() {
      if (crashing) throw new Error('broken screen');
      return <h1>Games</h1>;
    }

    const routes = collectScreenRoutes({
      '../routes/games/route.tsx': {
        route: {
          path: '/games',
          element: <RecoverableScreen />,
          chrome: 'app',
          auth: 'none',
        },
      },
    });
    const router = createMemoryRouter(routes, { initialEntries: ['/games'] });
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeVisible();
    crashing = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Games' })).toBeVisible();
  });
});

function BrokenPicker(): never {
  throw new Error('broken picker');
}
