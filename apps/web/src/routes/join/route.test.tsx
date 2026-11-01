import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, ApiError } from '../../lib/api/client';
import { clearRoomGrant, roomGrantState } from './grant-store';
import { JoinScreen } from './route';

const session = vi.hoisted(() => ({ current: { userId: 'u-player' } as object | null | undefined }));

vi.mock('../../lib/api/session', () => ({ useSession: () => session.current }));
vi.mock('../../lib/api/client', async (original) => {
  const actual = await original<typeof import('../../lib/api/client')>();
  return { ...actual, api: vi.fn() };
});

const mockedApi = vi.mocked(api);

function jwt(exp: number): string {
  const payload = btoa(JSON.stringify({ exp })).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  return `header.${payload}.signature`;
}

function Location() {
  const location = useLocation();
  return (
    <>
      <output>{`${location.pathname}${location.search}`}</output>
      <output data-testid="location-state">{JSON.stringify(location.state)}</output>
    </>
  );
}

function renderJoin() {
  return render(
    <MemoryRouter initialEntries={['/join/invite-token']}>
      <Routes>
        <Route path="/join/:inviteToken" element={<JoinScreen />} />
        <Route path="/age" element={<Location />} />
        <Route path="/g/:gameId" element={<Location />} />
        <Route path="/games" element={<Location />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('JoinScreen', () => {
  beforeEach(() => {
    session.current = { userId: 'u-player' };
    mockedApi.mockReset();
    localStorage.clear();
    act(() => clearRoomGrant());
  });

  afterEach(() => cleanup());

  it('accepts the invitation, keeps the grant in memory, and enters the game', async () => {
    const expiresAt = 1_800_000_000;
    mockedApi.mockResolvedValue({
      roomId: 'room-1',
      grant: jwt(expiresAt),
      pin: { gameId: 'game-1', branchId: 'branch-1', buildId: 'build-1' },
      roomsUrl: 'https://api.example.test/ws/rooms',
    });

    renderJoin();
    expect(screen.getByRole('status')).toHaveTextContent('Joining room');
    await screen.findByText('/g/game-1?v=branch-1&room=room-1');

    expect(mockedApi).toHaveBeenCalledWith('/join/invite-token');
    expect(screen.getByText('/g/game-1?v=branch-1&room=room-1').textContent).not.toContain('header.');
    expect(localStorage).toHaveLength(0);
    expect(roomGrantState()).toEqual({
      roomId: 'room-1',
      grant: expect.any(String),
      pin: { gameId: 'game-1', branchId: 'branch-1', buildId: 'build-1' },
      roomsUrl: 'https://api.example.test/ws/rooms',
      expiresAt: expiresAt * 1000,
    });
  });

  it('sends an unauthenticated visitor through the age gate with the join path preserved', async () => {
    session.current = null;
    renderJoin();

    await screen.findByText('/age');
    expect(screen.getByTestId('location-state')).toHaveTextContent(JSON.stringify({ next: '/join/invite-token' }));
    expect(mockedApi).not.toHaveBeenCalled();
  });

  it('waits for session loading before choosing the join path', async () => {
    session.current = undefined;
    renderJoin();

    expect(screen.getByRole('status')).toHaveTextContent('Joining room');
    expect(mockedApi).not.toHaveBeenCalled();
  });

  it('sends a rejected age attestation back through the age gate', async () => {
    mockedApi.mockRejectedValue(new ApiError(403, { error: 'age_required' }));
    renderJoin();

    await screen.findByText('/age');
    expect(screen.getByTestId('location-state')).toHaveTextContent(JSON.stringify({ next: '/join/invite-token' }));
  });

  it.each([
    [new ApiError(410, { error: 'invite_gone' }), 'Link expired or already used'],
    [new ApiError(410, { error: 'room_ended' }), 'Room ended'],
    [new ApiError(403, { error: 'friends_not_allowed' }), 'Not allowed'],
    [new TypeError('offline'), 'Could not join right now'],
  ])('renders a stable join failure for %s', async (error, message) => {
    mockedApi.mockRejectedValue(error);
    renderJoin();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(message));
    await act(() => screen.getByRole('button', { name: 'Back to games' }).click());
    await screen.findByText('/games');
  });
});
