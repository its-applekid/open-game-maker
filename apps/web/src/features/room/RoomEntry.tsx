import type { JoinRejection } from '@ogm/contracts';

import type { RoomStatus } from '../../net/room-store';

type RejectionAction = { message: string; label: string; reload: boolean };

export function rejectionAction(rejection: JoinRejection): RejectionAction {
  switch (rejection.code) {
    case 'BUILD_MISMATCH':
      return { message: 'The game was updated', label: 'Reload', reload: true };
    case 'ROOM_FULL':
      return { message: `Room is full (${rejection.max})`, label: 'Back to games', reload: false };
    case 'PROTOCOL_MISMATCH':
      return { message: 'The game needs to reload', label: 'Reload', reload: true };
    case 'GRANT_INVALID':
    case 'GRANT_EXPIRED':
    case 'GRANT_REVOKED':
      return { message: 'Ask for a new link', label: 'Back to games', reload: false };
  }
}

type RoomEntryProps = {
  gameTitle: string;
  onLeave(): void;
  onReload?: () => void;
  rejection?: JoinRejection;
  status: RoomStatus;
};

export function RoomEntry({ gameTitle, onLeave, onReload = () => window.location.reload(), rejection, status }: RoomEntryProps) {
  if (status === 'connected' || status === 'ended' || status === 'idle') return null;

  if (status === 'rejected' && rejection !== undefined) {
    const action = rejectionAction(rejection);
    return (
      <div className="room-entry" role="status" aria-live="polite">
        <div className="room-phase-card">
          <p>{action.message}</p>
          <button className="tap-primary" type="button" onClick={action.reload ? onReload : onLeave}>
            {action.label}
          </button>
        </div>
      </div>
    );
  }

  const message =
    status === 'reconnecting'
      ? 'Reconnecting…'
      : status === 'desynced'
        ? 'Catching up…'
        : `Joining ${gameTitle}…`;
  return (
    <div className="room-entry" role="status" aria-live="polite">
      <div className="room-phase-card">{message}</div>
    </div>
  );
}
