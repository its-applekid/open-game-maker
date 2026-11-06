import { useEffect, useState } from 'react';

import type { Phase, ServerMessage } from '@ogm/contracts';

/** Protocol 2 adds `abandoned`: every seat forfeited, so the room ended with nobody left in it. */
export type EndedReason = Extract<ServerMessage, { t: 'ended' }>['reason'] | 'abandoned';

type ScreenInput = {
  phase: Phase;
  phaseAt: number;
  ownerName: string;
  ended?: EndedReason;
};

export type PhaseScreen = {
  kind: 'none' | 'migrating' | 'paused' | 'ended';
  title: string;
  countdownUntil?: number;
};

export function screenFor(input: ScreenInput): PhaseScreen {
  switch (input.phase) {
    case 'editing':
    case 'playing':
      return { kind: 'none', title: '' };
    case 'migrating':
      return { kind: 'migrating', title: 'Loading the new build' };
    case 'pausedForHost':
      return {
        kind: 'paused',
        title: `${input.ownerName}'s connection dropped`,
        countdownUntil: input.phaseAt + 120_000,
      };
    case 'ended':
      return { kind: 'ended', title: endedTitle(input.ended, input.ownerName) };
  }
}

type PhaseScreensProps = ScreenInput & {
  lastSaveAt?: string;
  now?: () => number;
  onLeave(): void;
};

export function PhaseScreens({ lastSaveAt, now = Date.now, onLeave, ...input }: PhaseScreensProps) {
  const screen = screenFor(input);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (screen.kind !== 'paused') return;
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [screen.kind]);

  if (screen.kind === 'none') return null;
  const remaining =
    screen.countdownUntil === undefined ? undefined : Math.max(0, Math.ceil((screen.countdownUntil - now()) / 1_000));

  return (
    <div className="room-phase-screen" role="status" aria-live="polite">
      <div className="room-phase-card">
        <h2>{screen.title}</h2>
        {remaining === undefined ? null : <p>{remaining} seconds</p>}
        {lastSaveAt ? <p>Last autosave {new Date(lastSaveAt).toLocaleTimeString()}</p> : null}
        {screen.kind === 'ended' ? (
          <button className="tap-primary" type="button" onClick={onLeave}>
            Leave
          </button>
        ) : null}
      </div>
    </div>
  );
}

function endedTitle(reason: EndedReason | undefined, ownerName: string): string {
  switch (reason) {
    case 'host-left':
      return `${ownerName} left`;
    case 'owner-closed':
      return `${ownerName} ended the game`;
    case 'idle':
      return 'The room closed';
    case 'revoked':
      return 'Your invite was revoked';
    default:
      return 'Room ended';
  }
}
