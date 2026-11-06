import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';

import type { RoomPin } from '@ogm/contracts';

import type { ScreenRoute } from '../../app/screen';
import { api, ApiError } from '../../lib/api/client';
import { useSession } from '../../lib/api/session';
import { storeRoomGrant } from './grant-store';

type JoinResponse = { roomId: string; grant: string; pin: RoomPin; roomsUrl: string };

function errorCode(error: ApiError): string | undefined {
  if (typeof error.body !== 'object' || error.body === null || !('error' in error.body)) return undefined;
  const code = (error.body as { error?: unknown }).error;
  return typeof code === 'string' ? code : undefined;
}

function joinError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Could not join right now';
  const code = errorCode(error);
  if (error.status === 410 && code === 'room_ended') return 'Room ended';
  if (error.status === 410) return 'Link expired or already used';
  if (error.status === 403) return 'Not allowed';
  return 'Could not join right now';
}

export function JoinScreen() {
  const { data: session, isPending: sessionPending } = useSession();
  const { inviteToken } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const next = `${location.pathname}${location.search}`;
    if (sessionPending) return;
    if (session === null) {
      navigate(`/signin?next=${encodeURIComponent(next)}`, { replace: true });
      return;
    }
    if (!inviteToken) {
      setFailure('Link expired or already used');
      return;
    }

    let active = true;
    void api<JoinResponse>(`/join/${encodeURIComponent(inviteToken)}`)
      .then((joined) => {
        if (!active) return;
        storeRoomGrant(joined);
        const query = new URLSearchParams({ v: joined.pin.branchId, room: joined.roomId });
        navigate(`/g/${encodeURIComponent(joined.pin.gameId)}?${query.toString()}`, { replace: true });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setFailure(joinError(error));
      });
    return () => {
      active = false;
    };
  }, [inviteToken, location.pathname, location.search, navigate, session, sessionPending]);

  if (!failure) return null;
  return (
    <main aria-live="polite">
      <p role="status">{failure}</p>
    </main>
  );
}

export const route: ScreenRoute = {
  path: '/join/:inviteToken',
  element: <JoinScreen />,
  chrome: 'bare',
  auth: 'none',
};
