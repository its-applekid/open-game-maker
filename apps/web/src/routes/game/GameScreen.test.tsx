import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OgmHost } from '../../app/testHook';

const editorApi = vi.hoisted(() => ({
  acquireLease: vi.fn(),
  getDesignSnapshot: vi.fn(),
  getGame: vi.fn(),
  heartbeatLease: vi.fn(),
  openTransactionStream: vi.fn(),
  postTransaction: vi.fn(),
  releaseLease: vi.fn(),
}));

const host = vi.hoisted(() => {
  const controller = {
    applyDesign: vi.fn(),
    dispose: vi.fn(),
    setMode: vi.fn(),
    setSettings: vi.fn(),
    state: vi.fn(() => ({ bridgeState: 'connecting' as const, dropped: 0 })),
  };
  return { controller, mountGameFrame: vi.fn(() => controller) };
});

vi.mock('../../features/editor/api', () => editorApi);
vi.mock('../../features/editor/frame', () => host);

import { GameScreen } from './GameScreen';

function renderGame(entry = '/g/game') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/g/:gameId" element={<GameScreen />} />
          <Route path="/games" element={<h1>Games destination</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  editorApi.getGame.mockResolvedValue({ id: 'game', title: 'Goblin Cellar' });
  editorApi.getDesignSnapshot.mockResolvedValue({
    rev: 4,
    buildId: 'build',
    doc: { schemaVersion: 1, globals: {}, entities: {} },
  });
  editorApi.acquireLease.mockResolvedValue({
    ok: true,
    lease: { token: 3, expiresAt: '2026-11-02T03:00:00.000Z' },
  });
  editorApi.heartbeatLease.mockResolvedValue({
    ok: true,
    lease: { token: 3, expiresAt: '2026-11-02T03:01:00.000Z' },
  });
  editorApi.releaseLease.mockResolvedValue({
    ok: true,
    lease: { token: 3, expiresAt: '2026-11-02T03:01:00.000Z' },
  });
  editorApi.postTransaction.mockResolvedValue({ ok: true, rev: 5 });
  editorApi.openTransactionStream.mockReturnValue({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn(),
  });
  host.controller.state.mockReturnValue({ bridgeState: 'connecting', dropped: 0 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete window.__ogmHost;
});

describe('GameScreen', () => {
  it('defaults to main/play and preserves the prototype bar ordering', async () => {
    renderGame();

    expect(await screen.findByText('Goblin Cellar')).toBeVisible();
    const buttons = screen.getAllByRole('button').map((button) => button.textContent?.trim());
    expect(buttons.slice(0, 4)).toEqual(['Games', '▶ Play', '✎ Edit', 'Ask for a change']);
    await waitFor(() =>
      expect(host.mountGameFrame).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: 'game',
          buildId: 'build',
          mode: 'play',
          gamesOrigin: 'http://127.0.0.1:10000',
        }),
      ),
    );
  });

  it('shares mode in the query and acquires an edit lease', async () => {
    renderGame();
    await screen.findByText('Goblin Cellar');

    fireEvent.click(screen.getByRole('button', { name: /edit/i }));

    await waitFor(() => expect(editorApi.acquireLease).toHaveBeenCalledWith('game', 'main', expect.any(String)));
    expect(host.controller.setMode).toHaveBeenCalledWith('edit');
  });

  it('disposes the frame before returning to Games', async () => {
    renderGame();
    await waitFor(() => expect(host.mountGameFrame).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: 'Games' }));

    expect(await screen.findByRole('heading', { name: 'Games destination' })).toBeVisible();
    expect(host.controller.dispose).toHaveBeenCalled();
  });

  it('exposes live game state directly under the test hook', async () => {
    const baseHost: OgmHost = {
      version: 1,
      route: () => '/g/game',
      navigate: vi.fn(),
      register: vi.fn(),
      get: vi.fn(),
      snapshot: () => ({ route: '/g/game', registered: [] }),
    };
    window.__ogmHost = baseHost;
    renderGame('/g/game?test');

    await waitFor(() => expect((window.__ogmHost as OgmHost & { game?: { mode: string } }).game?.mode).toBe('play'));
  });
});
