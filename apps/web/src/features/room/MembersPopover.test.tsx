import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { Membership } from '@ogm/contracts';

import { MembersPopover } from './MembersPopover';

afterEach(() => cleanup());

const members: Record<string, Membership> = {
  owner: {
    userId: 'owner',
    name: 'Kim',
    role: 'owner',
    playerIndex: 0,
    connected: true,
    sessions: ['owner-session'],
  },
  watcher: {
    userId: 'watcher',
    name: 'Sam',
    role: 'player',
    playerIndex: 1,
    connected: false,
    sessions: [],
  },
};

it('shows member presence and owner controls', () => {
  const onEnd = vi.fn();
  const onKick = vi.fn();
  render(<MembersPopover members={members} onEnd={onEnd} onKick={onKick} owner />);

  expect(screen.getByText('Sam')).toBeVisible();
  expect(screen.getByText(/Disconnected/)).toBeVisible();
  const kick = screen.getByRole('button', { name: 'Kick Sam' });
  expect(kick).toHaveClass('tap-secondary');
  fireEvent.click(kick);
  fireEvent.click(screen.getByRole('button', { name: 'End room' }));
  expect(onKick).toHaveBeenCalledWith('watcher');
  expect(onEnd).toHaveBeenCalledOnce();
});

it('never gives a watcher owner controls', () => {
  render(<MembersPopover members={members} onEnd={vi.fn()} onKick={vi.fn()} owner={false} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
