import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Release } from '@ogm/contracts/browser';

import { RollbackDialog } from './RollbackDialog';

const release: Release = {
  id: 'release_old',
  gameId: 'game',
  seq: 1,
  version: '1.0.0',
  buildId: 'build_old',
  snapshotId: 'snapshot_old',
  gitTag: 'v1.0.0',
  kind: 'publish',
  changelog: { summary: 'First release', items: [] },
  publishedBy: 'user',
  publishedAt: '2026-11-01T00:00:00.000Z',
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('RollbackDialog', () => {
  it('disables confirmation until the preview reports its affected saves', async () => {
    let resolvePreview!: (response: Response) => void;
    const preview = new Promise<Response>((resolve) => {
      resolvePreview = resolve;
    });
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      if (input.toString().includes('rollback-preview')) return preview;
      if (input.toString().endsWith('/rollback') && init?.method === 'POST') {
        return Promise.resolve(json({ id: 'release_rollback' }));
      }
      return Promise.resolve(json({ error: 'not_found' }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);
    const rolledBack = vi.fn();
    renderDialog(rolledBack);

    const confirm = screen.getByRole('button', { name: 'Roll back to 1.0.0' });
    expect(confirm).toBeDisabled();
    await act(async () => resolvePreview(json({ affectedSaves: 3 })));

    expect(await screen.findByText('3 saves will stop loading until you publish again.')).toBeVisible();
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(rolledBack).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/games/game/rollback',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ releaseId: 'release_old' }) }),
    );
  });
});

function renderDialog(onRolledBack: () => void) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RollbackDialog gameId="game" release={release} onClose={vi.fn()} onRolledBack={onRolledBack} />
    </QueryClientProvider>,
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
