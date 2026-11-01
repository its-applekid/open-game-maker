import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { JobRow } from './JobRow';
import { buildChatJob } from './test-fixtures';

afterEach(() => cleanup());

describe('JobRow', () => {
  it('shows reset timing, edit, cancel, and family units while queued', () => {
    render(
      <JobRow
        job={buildChatJob({ state: 'queued', start: 'at_reset', startAt: null })}
        unitLabel="coin"
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Starts at the daily reset')).toBeInTheDocument();
    expect(screen.getByText('1.5 of 4 coins')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('hides queue actions once a build is running', () => {
    render(<JobRow job={buildChatJob()} unitLabel="coin" onOpen={vi.fn()} onEdit={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });
});
