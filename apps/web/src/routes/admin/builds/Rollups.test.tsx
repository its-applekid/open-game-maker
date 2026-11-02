import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Rollup } from '@ogm/contracts';

import { adminActivities } from '../types';
import { RollupGroup, Rollups } from './Rollups';

describe('admin roll-ups', () => {
  it('does not report an analytics failure as an empty window', () => {
    render(<RollupGroup error label="By game" loading={false} rows={[]} />);

    expect(screen.getByText('By game unavailable.')).toBeVisible();
    expect(screen.queryByText('No builds in this window.')).not.toBeInTheDocument();
  });

  it('reports empty game and member lists without waiting for disabled queries', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Rollups games={[]} members={[]} />
      </QueryClientProvider>,
    );

    expect(screen.getAllByText('No builds in this window.')).toHaveLength(2);
    expect(screen.queryByText(/Loading by/)).not.toBeInTheDocument();
  });

  it('shows recorded activity even when no event has a build id', () => {
    const byActivity = Object.fromEntries(
      adminActivities.map((activity) => [activity, { count: 0, durationMs: 0 }]),
    ) as Rollup['byActivity'];
    byActivity.writing = { count: 1, durationMs: 60_000 };

    const view = render(
      <RollupGroup
        error={false}
        label="By game"
        loading={false}
        rows={[
          {
            id: 'g1',
            label: 'Garden Quest',
            rollup: {
              scope: 'game',
              id: 'g1',
              from: '2026-10-01T00:00:00.000Z',
              to: '2026-11-01T00:00:00.000Z',
              builds: 0,
              usageMicroUsd: null,
              byActivity,
            },
          },
        ]}
      />,
    );

    expect(view.getByRole('img', { name: 'Garden Quest activity minutes' })).toBeVisible();
    expect(view.getByText('0 builds')).toBeVisible();
    expect(view.container).not.toHaveTextContent('No builds in this window.');
  });
});
