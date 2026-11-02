import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { JoinRejection } from '@ogm/contracts';

import { RoomEntry, rejectionAction } from './RoomEntry';

const cases: Array<[JoinRejection, string, string]> = [
  [
    { code: 'BUILD_MISMATCH', expected: { gameId: 'game', branchId: 'main', buildId: 'next' } },
    'The game was updated',
    'Reload',
  ],
  [{ code: 'ROOM_FULL', max: 4 }, 'Room is full (4)', 'Back to games'],
  [{ code: 'GRANT_INVALID' }, 'Ask for a new link', 'Back to games'],
  [{ code: 'GRANT_EXPIRED' }, 'Ask for a new link', 'Back to games'],
  [{ code: 'GRANT_REVOKED' }, 'Ask for a new link', 'Back to games'],
  [{ code: 'PROTOCOL_MISMATCH' }, 'The game needs to reload', 'Reload'],
];

describe('rejectionAction', () => {
  it.each(cases)('maps $code to stable copy and an action', (rejection, message, label) => {
    expect(rejectionAction(rejection)).toEqual({ message, label, reload: label === 'Reload' });
  });
});

it('renders joining and retry states without exposing the grant', () => {
  const onLeave = vi.fn();
  const { rerender } = render(<RoomEntry gameTitle="Goblin Cellar" onLeave={onLeave} status="connecting" />);
  expect(screen.getByRole('status')).toHaveTextContent('Joining Goblin Cellar…');

  rerender(
    <RoomEntry
      gameTitle="Goblin Cellar"
      onLeave={onLeave}
      rejection={{ code: 'GRANT_EXPIRED' }}
      status="rejected"
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Ask for a new link');
  fireEvent.click(screen.getByRole('button', { name: 'Back to games' }));
  expect(onLeave).toHaveBeenCalledOnce();
});
