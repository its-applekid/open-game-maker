import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { MergeConflict } from '@ogm/contracts/browser';

import { ConflictCard } from './ConflictCard';

vi.mock('./SideBySide', () => ({
  displayValue: (value: unknown) => String(value),
  SideBySide: ({ mineValue, theirsValue }: { mineValue: unknown; theirsValue: unknown }) => (
    <div>
      {String(mineValue)} / {String(theirsValue)}
    </div>
  ),
}));

const conflict = (kind: MergeConflict['kind'], ours: unknown = false, theirs: unknown = true): MergeConflict => ({
  id: 'conflict_one',
  path: '/entities/door/props/locked',
  entityId: 'door',
  controlId: 'locked',
  kind,
  ours: { path: '/locked', before: 0, after: ours, txId: 'ours' },
  theirs: { path: '/locked', before: 0, after: theirs, txId: 'theirs' },
});

describe('ConflictCard', () => {
  it('offers Both only for delete-versus-edit and persists a typed scalar value', () => {
    const resolved = vi.fn();
    const view = render(
      <ConflictCard
        conflict={conflict('both_changed', 1, 2)}
        gameId="game"
        mine={{ buildId: 'mine', rev: 1, doc: { schemaVersion: 1, globals: {}, entities: {} } }}
        theirs={{ buildId: 'theirs', rev: 1, doc: { schemaVersion: 1, globals: {}, entities: {} } }}
        onResolve={resolved}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Both' })).not.toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: 'Custom value' });
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.blur(input);
    expect(resolved).toHaveBeenCalledWith({ value: 7 });

    view.rerender(
      <ConflictCard
        conflict={conflict('delete_vs_edit', 1, 2)}
        gameId="game"
        mine={{ buildId: 'mine', rev: 1, doc: { schemaVersion: 1, globals: {}, entities: {} } }}
        theirs={{ buildId: 'theirs', rev: 1, doc: { schemaVersion: 1, globals: {}, entities: {} } }}
        resolution={{ value: 7 }}
        onResolve={resolved}
      />,
    );

    expect(screen.getByRole('button', { name: 'Both' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Custom value' })).toHaveValue('7');
  });
});
