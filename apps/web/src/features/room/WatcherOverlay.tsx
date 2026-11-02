import { useEffect } from 'react';

import type { Presence } from '@ogm/contracts';

type WatcherOverlayProps = {
  branchName: string;
  catchingUp?: boolean;
  onSelection?: (ids: readonly string[]) => void;
  presence: Presence;
  version?: string;
};

export function WatcherOverlay({
  branchName,
  catchingUp = false,
  onSelection,
  presence,
  version,
}: WatcherOverlayProps) {
  useEffect(() => {
    onSelection?.(presence.privateMode ? [] : presence.selection);
  }, [onSelection, presence.privateMode, presence.selection]);

  return (
    <aside className="watcher-overlay" aria-label="Room status">
      <span className="room-version-badge">{version === undefined ? branchName : `${branchName} · v${version}`}</span>
      <div className="watcher-status" aria-live="polite">
        {catchingUp ? <span role="status">catching up</span> : null}
        {presence.privateMode ? <span>talking to the builder…</span> : null}
        {presence.building ? (
          <span>
            building… {presence.building.label} {Math.round(presence.building.pct)}%
          </span>
        ) : null}
      </div>
    </aside>
  );
}
