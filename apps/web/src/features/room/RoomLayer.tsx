import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from '../../lib/api/client';
import { PhaseScreens } from './PhaseScreens';
import { RoomEntry } from './RoomEntry';
import type { RoomSessionSnapshot } from './session';
import { WatcherOverlay } from './WatcherOverlay';

type BranchLabel = { name: string; version: string };

type RoomLayerProps = {
  gameTitle: string;
  lastSaveAt?: string;
  onLeave(): void;
  onMode(mode: 'play' | 'edit'): void;
  onSelection(ids: readonly string[]): void;
  snapshot?: RoomSessionSnapshot;
};

export function RoomLayer({ gameTitle, lastSaveAt, onLeave, onMode, onSelection, snapshot }: RoomLayerProps) {
  const watcher = snapshot?.role === 'peer' && snapshot.phase === 'editing';
  const pin = snapshot?.pin;
  const branch = useQuery({
    queryKey: ['room-branch', pin?.gameId, pin?.branchId],
    queryFn: () =>
      api<BranchLabel>(
        `/games/${encodeURIComponent(pin?.gameId ?? '')}/branches/${encodeURIComponent(pin?.branchId ?? '')}`,
      ),
    enabled: watcher && pin !== undefined,
    retry: false,
  });

  useEffect(() => {
    if (snapshot?.phase === 'playing') onMode('play');
    if (snapshot?.phase === 'editing') onMode('edit');
  }, [onMode, snapshot?.phase]);

  if (snapshot === undefined) return null;
  const ownerName =
    (snapshot.ownerId === undefined ? undefined : snapshot.members[snapshot.ownerId]?.name) ?? 'The host';

  return (
    <>
      <RoomEntry gameTitle={gameTitle} onLeave={onLeave} rejection={snapshot.rejection} status={snapshot.status} />
      {watcher && snapshot.presence !== undefined && pin !== undefined ? (
        <WatcherOverlay
          branchName={branch.data?.name ?? pin.branchId}
          catchingUp={snapshot.status === 'desynced'}
          onSelection={onSelection}
          presence={snapshot.presence}
          version={branch.data?.version}
        />
      ) : null}
      {snapshot.phase === undefined ? null : (
        <PhaseScreens
          ended={snapshot.ended}
          lastSaveAt={lastSaveAt}
          onLeave={onLeave}
          ownerName={ownerName}
          phase={snapshot.phase}
          phaseAt={snapshot.phaseAt ?? Date.now()}
        />
      )}
    </>
  );
}
