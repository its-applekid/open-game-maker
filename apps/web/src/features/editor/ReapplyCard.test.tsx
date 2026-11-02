import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReapplyReport } from '@ogm/contracts/browser';

import { ReapplyCard } from './ReapplyCard';

const carried = Array.from({ length: 20 }, (_, index) => `enemy.speed@e_${index}`);
const report = {
  carried,
  renamed: [{ from: 'enemy.tint@global', to: 'enemy.color@global' }],
  needsChoice: [{ key: 'enemy.speed@global', mine: 3, allowed: [1, 2] }],
  conflicts: [{ key: 'enemy.count@global', mine: 4, builder: 6 }],
  dropped: [
    { key: 'enemy.old@global', reason: 'control_removed' },
    { key: 'enemy.gone@global', reason: 'target_removed' },
  ],
} as unknown as ReapplyReport;

afterEach(cleanup);

describe('ReapplyCard', () => {
  it('groups every AE2 report outcome and submits explicit choices before switching', () => {
    const confirm = vi.fn();
    render(<ReapplyCard report={report} onConfirm={confirm} />);

    expect(screen.getByRole('heading', { name: 'Carried 20' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Renamed 1' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Needs a choice 1' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Conflicts 1' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Dropped 2' })).toBeVisible();
    expect(screen.getByText('enemy.speed@global')).toBeVisible();
    expect(screen.getByText('enemy.count@global')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Keep my enemy.speed@global' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use builder enemy.count@global' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply update' }));

    expect(confirm).toHaveBeenCalledWith({ 'enemy.speed@global': 3, 'enemy.count@global': 6 });
  }, 10_000);
});
