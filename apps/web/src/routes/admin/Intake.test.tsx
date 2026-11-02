import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { IntakeSummary } from './Intake';

describe('intake status', () => {
  it('renders the five operational counts without leaking a folder id', () => {
    const data = {
      drops: [
        { dropId: 'a', name: 'A', time: '2026-11-01T00:00:00.000Z', status: 'queued', problems: 0 },
        { dropId: 'b', name: 'B', time: '2026-11-01T00:01:00.000Z', status: 'imported', problems: 0 },
        { dropId: 'c', name: 'C', time: '2026-11-01T00:02:00.000Z', status: 'duplicate', problems: 0 },
        { dropId: 'd', name: 'D', time: '2026-11-01T00:03:00.000Z', status: 'blocked', problems: 0 },
        { dropId: 'e', name: 'E', time: '2026-11-01T00:04:00.000Z', status: 'awaiting-license', problems: 0 },
      ],
      parseErrors: 2,
      folder_id: 'secret-folder',
    } as never;

    render(<IntakeSummary data={data} now={Date.parse('2026-11-01T01:00:00.000Z')} />);

    for (const [label, value] of Object.entries({ Pending: 2, Downloaded: 1, Skipped: 1, Rejected: 1, Failed: 2 })) {
      const stat = screen.getByText(label).closest('article');
      expect(stat).not.toBeNull();
      expect(within(stat!).getByText(String(value))).toBeVisible();
    }
    expect(screen.getByText(/stale/i)).toBeVisible();
    expect(screen.queryByText(/secret-folder|folder_id/i)).not.toBeInTheDocument();
  });
});
