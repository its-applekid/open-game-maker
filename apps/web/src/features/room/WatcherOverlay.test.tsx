import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Presence } from '@ogm/contracts';

import { WatcherOverlay } from './WatcherOverlay';

function presence(overrides: Partial<Presence> = {}): Presence {
  return { selection: ['e-1'], privateMode: false, ...overrides };
}

describe('WatcherOverlay', () => {
  it('shows the pinned branch version and only public building fields', () => {
    render(
      <WatcherOverlay
        branchName="Living room"
        presence={presence({ building: { jobId: 'private-job-id', label: 'Placing the world', pct: 40 } })}
        version="0.2.4"
      />,
    );

    expect(screen.getByText('Living room · v0.2.4')).toBeVisible();
    expect(screen.getByText('building… Placing the world 40%')).toBeVisible();
    expect(screen.queryByText(/private-job-id/)).not.toBeInTheDocument();
  });

  it('shows the private-panel line and clears the owner selection highlight', () => {
    const onSelection = vi.fn();
    render(
      <WatcherOverlay
        branchName="main"
        onSelection={onSelection}
        presence={presence({ privateMode: true })}
        version="0.0.4"
      />,
    );

    expect(screen.getByText('talking to the builder…')).toBeVisible();
    expect(onSelection).toHaveBeenLastCalledWith([]);
  });

  it('announces a resync without exposing a permanent panel', () => {
    render(<WatcherOverlay branchName="main" catchingUp presence={presence()} version="0.0.4" />);
    expect(screen.getByRole('status')).toHaveTextContent('catching up');
  });
});
