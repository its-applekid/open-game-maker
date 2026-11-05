import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { collectScreenRoutes } from '../../app/router';
import { route as playRoute } from './route';

const session = vi.hoisted(() => ({
  current: { data: { user: { id: 'u_player' } } as { user: { id: string } } | null, isPending: false },
}));

vi.mock('../../lib/api/session', () => ({ useSession: () => session.current }));

function Location() {
  const location = useLocation();
  return <output>{`${location.pathname}${location.search}`}</output>;
}

// The real route module keeps the path and the `auth: 'required'` guard the deep link depends on; only the screen body
// is swapped so the test never reaches the API.
function router(entry: string) {
  const routes = collectScreenRoutes({
    '../routes/play/route.tsx': { route: { ...playRoute, element: <p>Play screen</p>, chrome: 'bare' } },
  });
  return createMemoryRouter([...routes, { path: '/signin', element: <Location /> }], { initialEntries: [entry] });
}

describe('signed-out deep link', () => {
  afterEach(() => {
    cleanup();
    session.current = { data: { user: { id: 'u_player' } }, isPending: false };
  });

  it('sends a signed-out visitor through sign-in and back to the shared game', async () => {
    session.current = { data: null, isPending: false };

    render(<RouterProvider router={router('/play/castle-game?chat=job-1')} />);

    await waitFor(() =>
      expect(screen.getByText('/signin?next=%2Fplay%2Fcastle-game%3Fchat%3Djob-1')).toBeVisible(),
    );
  });

  it('opens the shared game for a signed-in visitor', async () => {
    render(<RouterProvider router={router('/play/castle-game')} />);

    expect(await screen.findByText('Play screen')).toBeVisible();
  });
});
