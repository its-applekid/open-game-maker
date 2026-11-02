import { useEffect } from 'react';

import type { Presence } from '@ogm/contracts';

type WatcherOverlayProps = {
  branchName: string;
  camera?: 'follow' | 'free';
  catchingUp?: boolean;
  onCamera?: (mode: 'follow' | 'free') => void;
  onSelection?: (ids: readonly string[]) => void;
  presence: Presence;
  version?: string;
};

export function WatcherOverlay({
  branchName,
  camera = 'follow',
  catchingUp = false,
  onCamera,
  onSelection,
  presence,
  version,
}: WatcherOverlayProps) {
  useEffect(() => {
    onSelection?.(presence.privateMode ? [] : presence.selection);
  }, [onSelection, presence.privateMode, presence.selection]);

  return (
    <aside className="watcher-overlay" aria-label="Room status">
      {onCamera ? (
        <div className="mode-segment watcher-camera" role="group" aria-label="Camera">
          <button
            className="tap-secondary"
            type="button"
            aria-pressed={camera === 'follow'}
            onClick={() => onCamera('follow')}
          >
            Follow
          </button>
          <button
            className="tap-secondary"
            type="button"
            aria-pressed={camera === 'free'}
            onClick={() => onCamera('free')}
          >
            Free
          </button>
        </div>
      ) : null}
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
