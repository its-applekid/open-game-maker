import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import type { RoomSessionSnapshot } from './session';
import { RoomLayer } from './RoomLayer';

vi.mock('../../lib/api/client', () => ({ api: vi.fn().mockRejectedValue(new Error('offline')) }));

const watcher: RoomSessionSnapshot = {
  status: 'connected',
  you: { userId: 'watcher', playerIndex: 1, sessionId: 'watcher-session' },
  role: 'peer',
  ownerId: 'owner',
  phase: 'editing',
  phaseAt: 1_000,
  lastRev: 5,
  members: {
    owner: {
      userId: 'owner',
      name: 'Kim',
      role: 'owner',
      playerIndex: 0,
      connected: true,
      sessions: ['owner-session'],
    },
  },
  presence: { selection: ['e-1'], privateMode: false },
  pin: { gameId: 'game', branchId: 'branch-1', buildId: 'build' },
};

function renderLayer(snapshot: RoomSessionSnapshot, onMode = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    onMode,
    ...render(
      <QueryClientProvider client={client}>
        <RoomLayer
          gameTitle="Goblin Cellar"
          onCamera={vi.fn()}
          onLeave={vi.fn()}
          onMode={onMode}
          onSelection={vi.fn()}
          snapshot={snapshot}
        />
      </QueryClientProvider>,
    ),
  };
}

it('shows watcher state with a branch-id fallback and follows room phases', async () => {
  const rendered = renderLayer(watcher);

  expect(screen.getByLabelText('Room status')).toHaveTextContent('branch-1');
  await waitFor(() => expect(rendered.onMode).toHaveBeenCalledWith('edit'));

  rendered.rerender(
    <QueryClientProvider client={new QueryClient()}>
      <RoomLayer
        gameTitle="Goblin Cellar"
        onCamera={vi.fn()}
        onLeave={vi.fn()}
        onMode={rendered.onMode}
        onSelection={vi.fn()}
        snapshot={{ ...watcher, phase: 'playing' }}
      />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(rendered.onMode).toHaveBeenCalledWith('play'));
  expect(screen.queryByLabelText('Room status')).not.toBeInTheDocument();
});
