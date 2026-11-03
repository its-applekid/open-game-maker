import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, matchRoutes, RouterProvider, useLocation } from 'react-router';
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
  '/admin/builds/job-1',
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

  it('wraps app routes in the prototype studio chrome', async () => {
    const routes = collectScreenRoutes({
      '../routes/games/route.tsx': {
        route: {
          path: '/games',
          element: <h1>Games</h1>,
          chrome: 'app',
          auth: 'none',
        },
      },
    });
    const router = createMemoryRouter(routes, { initialEntries: ['/games'] });

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('link', { name: 'Open Game Maker 2000' })).toHaveAttribute('href', '/');
    expect(document.querySelector('.studio-backdrop canvas')).toBeInTheDocument();
    const sound = screen.getByRole('button', { name: /sound/i });
    expect(sound).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(sound);

    expect(sound).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('slider', { name: 'Volume' })).toBeVisible();
  });

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

  it('keeps screen state across search-only navigation', async () => {
    const routes = collectScreenRoutes({
      '../routes/new/route.tsx': {
        route: {
          path: '/new',
          element: <StatefulScreen />,
          chrome: 'app',
          auth: 'none',
        },
      },
    });
    const router = createMemoryRouter(routes, { initialEntries: ['/new?step=genre'] });
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Adventure' }));
    expect(screen.getByRole('button', { name: 'Adventure' })).toHaveAttribute('aria-pressed', 'true');

    await router.navigate('/new?step=vibe');

    expect(await screen.findByText('?step=vibe')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Adventure' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('resets screen state when the same route selects another game', async () => {
    const routes = collectScreenRoutes({
      '../routes/games/route.tsx': {
        route: {
          path: '/games',
          element: <StatefulScreen />,
          chrome: 'app',
          auth: 'none',
        },
      },
    });
    const router = createMemoryRouter(routes, { initialEntries: ['/games?spotlight=g_1'] });
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Adventure' }));
    expect(screen.getByRole('button', { name: 'Adventure' })).toHaveAttribute('aria-pressed', 'true');

    await router.navigate('/games?spotlight=g_2');

    expect(await screen.findByText('?spotlight=g_2')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Adventure' })).toHaveAttribute('aria-pressed', 'false');
  });
});

function BrokenPicker(): never {
  throw new Error('broken picker');
}

function StatefulScreen() {
  const [selected, setSelected] = useState(false);
  const location = useLocation();
  return (
    <>
      <button type="button" aria-pressed={selected} onClick={() => setSelected(true)}>
        Adventure
      </button>
      <output>{location.search}</output>
    </>
  );
}
