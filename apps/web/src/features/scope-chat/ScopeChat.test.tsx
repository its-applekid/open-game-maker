import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import type { AgreedScope, AllowanceExceeded } from '@ogm/contracts';

const mocks = vi.hoisted(() => ({
  admit: vi.fn(),
  api: vi.fn(),
  scopeSession: vi.fn(),
  session: vi.fn(),
}));

vi.mock('./admit', async () => {
  const actual = await vi.importActual<typeof import('./admit')>('./admit');
  return { ...actual, admitNewGame: mocks.admit };
});
vi.mock('./useScopeSession', () => ({ useScopeSession: mocks.scopeSession }));
vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client');
  return { ...actual, api: mocks.api };
});
vi.mock('../../lib/api/session', () => ({ useSession: mocks.session }));

import { ScopeChat } from './ScopeChat';

const scope: AgreedScope = {
  session_id: 's_1',
  title: 'Moonlit Bakery',
  summary: 'Deliver bread at night.',
  scope: { included: ['one village'], excluded: [] },
  tickets: [
    {
      key: 'game',
      title: 'Build it',
      skills: [],
      dependsOn: [],
      acceptanceCriteria: ['One delivery is playable.'],
    },
  ],
  complexity: 2,
  open_questions: [],
  ideas: [],
};

const refusal: AllowanceExceeded = {
  error: 'allowance_exceeded',
  remainingMicroUsd: 1_200_000,
  resetsAt: '2026-11-02T07:00:00.000Z',
  offers: ['trim', 'split', 'queue', 'ask_admin'],
};

beforeEach(() => {
  mocks.admit.mockReset();
  mocks.api.mockReset();
  mocks.session.mockReturnValue({ data: undefined });
  mocks.scopeSession.mockReturnValue({
    sessionId: 's_1',
    jobId: undefined,
    scope,
    turns: [],
    status: 'agreed',
    error: '',
    send: vi.fn(),
    requestRevision: vi.fn().mockResolvedValue(undefined),
    addMessage: vi.fn(),
  });
});

afterEach(() => cleanup());

describe('ScopeChat offers', () => {
  it.each([
    ['Trim it', '[trim] Make this first build smaller, then agree a revised scope.'],
    ['Split it', '[split] Split this into a smaller first build, then agree a revised scope.'],
  ])('posts the exact revision request for %s', async (label, instruction) => {
    mocks.admit.mockResolvedValue({ kind: 'refused', ...refusal });
    renderChat();

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    fireEvent.click(await screen.findByRole('button', { name: label }));

    await waitFor(() => expect(mocks.scopeSession.mock.results[0]!.value.requestRevision).toHaveBeenCalledWith(instruction));
    expect(screen.queryByRole('region', { name: 'Build options' })).not.toBeInTheDocument();
  });

  it('keeps the offers visible when a revision request fails', async () => {
    const requestRevision = vi.fn().mockRejectedValue(new Error('offline'));
    mocks.scopeSession.mockReturnValue({ ...mocks.scopeSession(), requestRevision });
    mocks.admit.mockResolvedValue({ kind: 'refused', ...refusal });
    renderChat();

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Trim it' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('scope could not be revised');
    expect(screen.getByRole('region', { name: 'Build options' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Finish' })).toBeDisabled();
  });

  it('polls allowance status before enabling an admin retry', async () => {
    mocks.admit.mockResolvedValue({ kind: 'refused', ...refusal });
    mocks.api.mockResolvedValue({
      remainingMicroUsd: 4_000_000,
      remainingPercent: 80,
      unitLabel: 'credits',
      resetsAt: refusal.resetsAt,
      freeSlots: { new_game: 1, edit: 0 },
      queued: [],
    });
    renderChat();

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ask an admin' }));

    expect(await screen.findByText(/remain/)).toBeVisible();
    expect(mocks.api).toHaveBeenCalledWith('/budget/status');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Finish' })).toBeDisabled();
  });
});

function renderChat() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ScopeChat
          gameId="g_1"
          choices={{
            genre: 'Adventure',
            vibe: 'Cozy',
            family: 'smallscaleint',
            world: 'Sky islands',
            players: 'single',
            pov: 'iso',
          }}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
