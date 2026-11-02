import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RollupGroup } from './Rollups';

describe('admin roll-ups', () => {
  it('does not report an analytics failure as an empty window', () => {
    render(<RollupGroup error label="By game" loading={false} rows={[]} />);

    expect(screen.getByText('By game unavailable.')).toBeVisible();
    expect(screen.queryByText('No builds in this window.')).not.toBeInTheDocument();
  });
});
