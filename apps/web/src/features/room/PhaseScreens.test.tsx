import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Phase, ServerMessage } from '@ogm/contracts';

import { PhaseScreens, screenFor } from './PhaseScreens';

const endedReasons: Array<[Extract<ServerMessage, { t: 'ended' }>['reason'], string]> = [
  ['host-left', 'Kim left'],
  ['owner-closed', 'Kim ended the game'],
  ['idle', 'The room closed'],
  ['revoked', 'Your invite was revoked'],
];

describe('screenFor', () => {
  it.each<[Phase, string]>([
    ['editing', 'none'],
    ['migrating', 'migrating'],
    ['playing', 'none'],
    ['pausedForHost', 'paused'],
    ['ended', 'ended'],
  ])('maps %s to one screen', (phase, kind) => {
    expect(screenFor({ phase, phaseAt: 1_000, ownerName: 'Kim' }).kind).toBe(kind);
  });

  it.each(endedReasons)('maps %s to its end-state copy', (ended, title) => {
    expect(screenFor({ phase: 'ended', phaseAt: 1_000, ownerName: 'Kim', ended }).title).toBe(title);
  });

  it('counts host recovery from the server phase timestamp', () => {
    expect(screenFor({ phase: 'pausedForHost', phaseAt: 2_000, ownerName: 'Kim' })).toMatchObject({
      kind: 'paused',
      title: "Kim's connection dropped",
      countdownUntil: 122_000,
    });
  });
});

it('shows autosave evidence and leaves through the supplied action', () => {
  const onLeave = vi.fn();
  render(
    <PhaseScreens
      ended="host-left"
      lastSaveAt="2026-11-01T18:00:00.000Z"
      now={() => 10_000}
      onLeave={onLeave}
      ownerName="Kim"
      phase="ended"
      phaseAt={1_000}
    />,
  );

  expect(screen.getByRole('heading')).toHaveTextContent('Kim left');
  expect(screen.getByText(/Last autosave/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
  expect(onLeave).toHaveBeenCalledOnce();
});
