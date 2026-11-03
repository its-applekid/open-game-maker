import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';

import { GamesScreen } from './GamesScreen';

const games = [
  {
    id: 'g_1',
    title: 'Midnight Crumbs',
    ownerId: 'u_1',
    familyId: 'f_1',
    repo: null,
    coverUrl: null,
    publishedReleaseId: null,
    tagline: 'A cozy midnight adventure',
    choices: { genre: ['adventure'], vibe: ['cozy', 'creepy'] },
    createdAt: '2026-11-01T05:00:00Z',
    updatedAt: '2026-11-01T05:10:00Z',
  },
  {
    id: 'g_2',
    title: 'Goblin Cellar',
    ownerId: 'u_1',
    familyId: 'f_1',
    repo: { owner: 'its-everdred', name: 'goblin-cellar', url: 'https://example.test/goblin-cellar' },
    coverUrl: 'https://example.test/goblin.png',
    publishedReleaseId: 'r_7',
    choices: { genre: ['rpg', 'roguelike'] },
    createdAt: '2026-10-20T00:00:00Z',
    updatedAt: '2026-10-30T00:00:00Z',
  },
  {
    id: 'g_3',
    title: 'Sky Delivery',
    ownerId: 'u_1',
    familyId: 'f_1',
    repo: null,
    coverUrl: null,
    publishedReleaseId: null,
    choices: {},
    createdAt: '2026-10-25T00:00:00Z',
    updatedAt: '2026-10-25T00:00:00Z',
  },
];

const jobs = [
  {
    id: 'j_1',
    gameId: 'g_1',
    kind: 'new_game',
    state: 'running',
    friendlyState: 'Building',
    progressPercent: 40,
  },
];

const branches = [
  {
    id: 'main',
    gameId: 'g_2',
    name: 'main',
    gitRef: 'main',
    forkPoint: null,
    headRev: 40,
    latestBuildId: 'b_13',
    status: 'active',
    createdBy: 'u_1',
    createdAt: '2026-10-20T00:00:00Z',
  },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderGames(entry = '/games', client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <GamesScreen />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/games')) return json({ games });
      if (url.includes('/api/v1/jobs')) return json({ jobs });
      if (url.endsWith('/api/v1/games/g_2/branches')) return json({ branches });
      if (url.includes('/branches')) return json({ error: 'not_found' }, 404);
      return json({ error: 'unexpected' }, 500);
    }),
  );
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('GamesScreen', () => {
  it('renders real tiles, prioritizes the building game, and shows its friendly progress', async () => {
    const { container } = renderGames();

    await screen.findByRole('button', { name: /Midnight Crumbs/ });
    const tiles = [...container.querySelectorAll<HTMLElement>('[data-game-id]')];
    expect(tiles.map((tile) => tile.dataset.gameId)).toEqual(['g_1', 'g_2', 'g_3']);
    expect(screen.getByText('Building 40%')).toBeVisible();
    expect(screen.getAllByText('New')).toHaveLength(2);
  }, 10_000);

  it('opens the URL-selected spotlight and falls back to main when branches are unavailable', async () => {
    const { container } = renderGames('/games?spotlight=g_1');

    expect(await screen.findByRole('heading', { name: 'Midnight Crumbs' })).toBeVisible();
    expect(container.querySelector('.games-spotlight-media .game-cover')).toBeVisible();
    expect(screen.queryByText(/Your library|My games|Selected game|Choose what happens next|Versions/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Close game' })).toHaveTextContent('×');
    expect(screen.getByRole('listitem', { name: 'main' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Play Midnight Crumbs' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit Midnight Crumbs' })).toBeDisabled();
  });

  it('uses the prototype creation affordance without adding helper copy', async () => {
    const { container } = renderGames();

    await screen.findByRole('button', { name: 'New game' });
    expect(container.querySelector('.games-new .plus')).toHaveTextContent('+');
    expect(screen.queryByText(/Create a new game|Add another game|Start creating/)).toBeNull();
  });

  it('writes selection to the URL and returns focus to the tile after closing with Escape', async () => {
    renderGames('/games?test');
    const tile = await screen.findByRole('button', { name: /Goblin Cellar/ });

    fireEvent.click(tile);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('spotlight=g_2'));
    expect(await screen.findByRole('button', { name: 'Play Goblin Cellar' })).toBeEnabled();

    const close = screen.getByRole('button', { name: 'Close game' });
    await waitFor(() => expect(close).toHaveFocus());
    fireEvent.keyDown(close, { key: 'Escape' });
    await waitFor(() => expect(screen.getByTestId('location')).not.toHaveTextContent('spotlight'));
    expect(tile).toHaveFocus();
  });

  it('keeps cached tiles visible and offers retry when a refresh fails', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/games')) return json({ error: 'unavailable' }, 503);
      if (url.includes('/api/v1/jobs')) return json({ jobs: [] });
      return json({ error: 'not_found' }, 404);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['games'], games);

    const { container } = renderGames('/games', client);

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t refresh the library');
    expect(container.querySelectorAll('[data-game-id]')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});
