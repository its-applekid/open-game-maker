import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { VersionControls } from './VersionControls';

describe('VersionControls', () => {
  it('keeps version navigation out of the fixed editor chrome', () => {
    const { rerender } = renderControls('edit');

    expect(screen.queryByRole('group', { name: 'Versions and releases' })).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <VersionControls gameId="game" branchId="main" mode="play" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('group', { name: 'Versions and releases' })).toBeVisible();
  });
});

function renderControls(mode: 'play' | 'edit') {
  return render(
    <MemoryRouter>
      <VersionControls gameId="game" branchId="main" mode={mode} />
    </MemoryRouter>,
  );
}
