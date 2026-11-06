import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { UsersTable } from './Users';

const users = [
  {
    email: 'kevin@example.com',
    role: 'admin' as const,
    addedBy: 'env',
    addedAt: '2026-11-01T00:00:00.000Z',
    lastSignInAt: '2026-11-02T10:00:00.000Z',
  },
  {
    email: 'tester@example.com',
    role: 'player' as const,
    addedBy: 'u_1',
    addedAt: '2026-11-02T00:00:00.000Z',
    lastSignInAt: null,
  },
];

// The first render in a jsdom file carries the environment's cold-start cost (about 6 s on a slow host).
const FIRST_RENDER_MS = 20_000;

describe('allow-list user management', () => {
  it(
    'shows each role and last sign-in, and never offers to change or remove the caller',
    () => {
      const changeRole = vi.fn();
      const remove = vi.fn();
      render(
        <UsersTable
          currentEmail="kevin@example.com"
          users={users}
          onChangeRole={changeRole}
          onInvite={vi.fn()}
          onRemove={remove}
        />,
      );

      expect(screen.getByRole('combobox', { name: 'Role for kevin@example.com' })).toBeDisabled();
      expect(screen.getByText('Never').closest('tr')).toHaveTextContent('tester@example.com');
      expect(screen.queryByRole('button', { name: 'Remove kevin@example.com' })).not.toBeInTheDocument();

      fireEvent.change(screen.getByRole('combobox', { name: 'Role for tester@example.com' }), {
        target: { value: 'maker' },
      });
      expect(changeRole).toHaveBeenCalledWith(users[1], 'maker');

      fireEvent.click(screen.getByRole('button', { name: 'Remove tester@example.com' }));
      expect(remove).toHaveBeenCalledWith(users[1]);
    },
    FIRST_RENDER_MS,
  );

  it('reports a failed invite resend', () => {
    render(
      <UsersTable
        currentEmail="kevin@example.com"
        inviteFailed
        users={users}
        onChangeRole={vi.fn()}
        onInvite={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Invite could not be sent.');
  });
});
