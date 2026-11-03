import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VersionBranch } from './rules';
import { VersionsScreen } from './VersionsScreen';

const branch = (id: string, overrides: Partial<VersionBranch> = {}): VersionBranch => ({
  id,
  gameId: 'game',
  name: id,
  gitRef: `refs/heads/${id}`,
  forkPoint: id === 'main' ? null : { parentBranchId: 'main', parentRev: 2, gitSha: null },
  headRev: 4,
  latestBuildId: `${id}-build`,
  status: 'active',
  createdBy: 'user',
  createdAt: '2026-11-01T00:00:00.000Z',
  version: id === 'main' ? '2.1.0' : '0.2.0',
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('VersionsScreen', () => {
  it('disables creation at five active versions and enables it when another row is archived', async () => {
    const branches = ['main', 'one', 'two', 'three', 'four'].map((id) => branch(id));
    stubVersionApi(branches);
    const first = renderVersions('/g/game/versions?v=main');

    expect(await screen.findByText('5 of 5')).toBeVisible();
    expect(screen.getByRole('button', { name: 'New version from here' })).toBeDisabled();

    first.unmount();
    stubVersionApi([...branches.slice(0, 4), branch('old', { status: 'archived' })]);
    renderVersions('/g/game/versions?v=main');

    expect(await screen.findByText('4 of 5')).toBeVisible();
    expect(screen.getByRole('button', { name: 'New version from here' })).toBeEnabled();
  }, 15_000);

  it.each([
    ['Switch to blue', '/g/game?v=blue'],
    ['Play blue', '/g/game?v=blue&mode=play'],
    ['Edit blue', '/g/game?v=blue&mode=edit'],
  ])('%s opens the canonical game URL', async (action, expected) => {
    stubVersionApi([branch('main', { name: 'main' }), branch('blue')]);
    renderVersions('/g/game/versions?v=blue');

    const selected = await screen.findByRole('article', { name: 'blue version' });
    expect(selected).toHaveAttribute('aria-current', 'true');
    expect(selected).toHaveTextContent('Builders work on the main version');

    fireEvent.click(screen.getByRole('button', { name: action }));
    expect(await screen.findByTestId('location')).toHaveTextContent(expected);
  });

  it('confirms archive, posts once, and never offers archive on main', async () => {
    const branches = [branch('main', { name: 'main' }), branch('blue')];
    const fetchMock = stubVersionApi(branches);
    renderVersions('/g/game/versions?v=blue');

    expect(await screen.findByRole('article', { name: 'main version' })).not.toHaveTextContent('Archive');
    fireEvent.click(screen.getByRole('button', { name: 'Archive blue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive version' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/games/game/branches/blue/archive',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(
      fetchMock.mock.calls.filter(([path, init]) => path.toString().endsWith('/archive') && init?.method === 'POST'),
    ).toHaveLength(1);
  });

  it('keeps branch rows visible and marks build state unavailable when builds fail', async () => {
    stubVersionApi([branch('main', { name: 'main' }), branch('blue')], 503);
    renderVersions('/g/game/versions?v=blue');

    expect(await screen.findByRole('alert')).toHaveTextContent('Versions unavailable');
    expect(screen.getByRole('article', { name: 'blue version' })).toHaveTextContent('Build unavailable');
    expect(screen.queryByText('No build')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it.each([
    ['Bring blue into main', '/g/game/merge?source=blue&target=main'],
    ['Bring main into blue', '/g/game/merge?source=main&target=blue'],
  ])('%s preserves both branch identifiers', async (action, expected) => {
    stubVersionApi([branch('main', { name: 'main' }), branch('blue')]);
    renderVersions('/g/game/versions?v=blue');

    fireEvent.click(await screen.findByRole('button', { name: action }));
    expect(screen.getByTestId('location')).toHaveTextContent(expected);
  });
});

function renderVersions(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Location />
        <Routes>
          <Route path="/g/:gameId/versions" element={<VersionsScreen />} />
          <Route path="/g/:gameId" element={<p>Game</p>} />
          <Route path="/g/:gameId/merge" element={<p>Merge</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function stubVersionApi(branches: VersionBranch[], buildStatus = 200) {
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const path = input.toString();
    if (path.endsWith('/builds')) {
      return Promise.resolve(
        buildStatus === 200 ? json({ builds: [] }) : json({ error: 'builds_unavailable' }, buildStatus),
      );
    }
    if (path.endsWith('/archive') && init?.method === 'POST') {
      return Promise.resolve(json({ ...branches.find(({ id }) => path.includes(id)), status: 'archived' }));
    }
    if (path.endsWith('/branches')) return Promise.resolve(json({ branches }));
    return Promise.resolve(json({ error: 'not_found' }, 404));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
