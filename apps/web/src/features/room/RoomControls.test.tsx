import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { api } from '../../lib/api/client';
import type { RoomSession, RoomSessionSnapshot } from './session';
import { RoomMembersControl } from './RoomControls';

vi.mock('../../lib/api/client', () => ({ api: vi.fn() }));

const mockedApi = vi.mocked(api);

beforeEach(() => mockedApi.mockReset().mockResolvedValue(undefined));

it('lets only the owner kick a member through the relay and revoke route', async () => {
  const send = vi.fn();
  const session = {
    roomId: 'room-1',
    send,
    snapshot: vi.fn(),
    subscribe: vi.fn(),
    leave: vi.fn(),
  } satisfies RoomSession;
  const snapshot: RoomSessionSnapshot = {
    status: 'connected',
    you: { userId: 'owner', playerIndex: 0, sessionId: 'owner-session' },
    ownerId: 'owner',
    members: {
      owner: {
        userId: 'owner',
        name: 'Kim',
        role: 'owner',
        playerIndex: 0,
        connected: true,
        sessions: ['owner-session'],
      },
      player: {
        userId: 'player',
        name: 'Sam',
        role: 'player',
        playerIndex: 1,
        connected: true,
        sessions: ['player-session'],
      },
    },
  };

  render(<RoomMembersControl branchId="main" gameId="game" roomSession={session} roomSnapshot={snapshot} />);
  fireEvent.click(screen.getByRole('button', { name: '2 room members' }));
  fireEvent.click(screen.getByRole('button', { name: 'Kick Sam' }));

  expect(send).toHaveBeenCalledWith({ t: 'kick', userId: 'player' });
  await waitFor(() =>
    expect(mockedApi).toHaveBeenCalledWith('/rooms/room-1/revoke', {
      method: 'POST',
      json: { userId: 'player' },
    }),
  );
});
