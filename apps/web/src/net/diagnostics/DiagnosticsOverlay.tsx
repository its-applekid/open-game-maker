import type { ReactElement } from 'react';

import './diagnostics.css';
import { metricLines, type RoomFacts, type TransportFacts } from './metrics';
import { useNetMetrics } from './useNetMetrics';

export type DiagnosticsOverlayProps = {
  enabled: boolean;
  /** `published` is a served build; the overlay is a draft-and-test-build surface only (D-NET-14). */
  build: 'draft' | 'test' | 'published';
  /** `test.renderInfo` from the game frame. */
  read(): Promise<unknown>;
  room(): RoomFacts;
  transport?(): TransportFacts;
  intervalMs?: number;
  logEveryMs?: number;
};

/**
 * The netcode diagnostics overlay (design §8.2, research #499 §3.5). A debug surface behind `?net=1`, not product chrome:
 * no nav, no panel, no copy change on any creator screen.
 *
 * Renders nothing — and starts no timer — unless it is enabled *and* the build is not published.
 */
export function DiagnosticsOverlay(props: DiagnosticsOverlayProps): ReactElement | null {
  if (!props.enabled || props.build === 'published') return null;
  return <OverlayBody {...props} />;
}

function OverlayBody(props: DiagnosticsOverlayProps): ReactElement | null {
  const snapshot = useNetMetrics({
    read: props.read,
    room: props.room,
    ...(props.transport === undefined ? {} : { transport: props.transport }),
    ...(props.intervalMs === undefined ? {} : { intervalMs: props.intervalMs }),
    ...(props.logEveryMs === undefined ? {} : { logEveryMs: props.logEveryMs }),
  });
  if (snapshot === undefined) return null;

  return (
    <div className="diagnostics-overlay" data-testid="net-diagnostics" aria-hidden="true">
      {metricLines(snapshot).map((line, index) => (
        <div key={index}>{line}</div>
      ))}
    </div>
  );
}
