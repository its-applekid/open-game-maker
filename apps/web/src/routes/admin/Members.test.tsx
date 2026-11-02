import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MembersTable } from './Members';

const members = [
  {
    userId: 'u_owner',
    email: 'owner@example.com',
    role: 'owner' as const,
    capability: 'creator' as const,
    joinedAt: '2026-11-01T00:00:00.000Z',
    dailyMicroUsd: 1_000_000,
    remainingMicroUsd: 1_000_000,
  },
  {
    userId: 'u_member',
    email: 'member@example.com',
    role: 'member' as const,
    capability: 'player' as const,
    joinedAt: '2026-11-01T00:00:00.000Z',
    dailyMicroUsd: 1_000_000,
    remainingMicroUsd: 1_000_000,
  },
];

describe('member management', () => {
  it('never offers Remove for the owner and confirms before removing a member', () => {
    const remove = vi.fn();
    render(<MembersTable currentUserId="u_admin" members={members} onChangeRole={vi.fn()} onRemove={remove} />);

    expect(screen.getByText('owner@example.com').closest('tr')).not.toHaveTextContent('Remove member');
    fireEvent.click(screen.getByRole('button', { name: 'Remove member@example.com' }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(remove).toHaveBeenCalledWith('u_member');
  });
});
