import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PublishDialog } from './PublishDialog';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PublishDialog', () => {
  it('prefills the server draft, warns for a public repository, and posts the edited public words', async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const path = input.toString();
      if (path.includes('publish-preview')) {
        return Promise.resolve(
          json({
            version: '3.0.0',
            changelog: { summary: 'A better dungeon', items: [{ kind: 'add', text: 'Added a boss room' }] },
          }),
        );
      }
      if (path.endsWith('/publish') && init?.method === 'POST') return Promise.resolve(json({ id: 'release_new' }));
      return Promise.resolve(json({ error: 'not_found' }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);
    const published = vi.fn();
    renderDialog({ publicRepo: true, onPublished: published });

    const changelog = await screen.findByRole('textbox', { name: 'What changed' }, { timeout: 5_000 });
    await waitFor(() => expect(changelog).toHaveValue('A better dungeon\n\nAdded a boss room'));
    expect(screen.getByText('These words will be public.')).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'What changed' }), { target: { value: 'Boss room ready' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish 3.0.0' }));

    await waitFor(() => expect(published).toHaveBeenCalledTimes(1));
    const publishCall = fetchMock.mock.calls.find(([path]) => path.toString().endsWith('/publish'));
    expect(publishCall?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ buildId: 'build_one', changelog: { summary: 'Boss room ready', items: [] } }),
      }),
    );
  }, 15_000);

  it('keeps a gate refusal and the dialog visible verbatim', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request) =>
        Promise.resolve(
          input.toString().includes('publish-preview')
            ? json({ version: '3.0.0', changelog: { summary: 'Updates', items: [] } })
            : json('asset synty/goblin.glb violates public-pack rule', 422),
        ),
      ),
    );
    renderDialog({ publicRepo: false });

    fireEvent.click(await screen.findByRole('button', { name: 'Publish 3.0.0' }, { timeout: 5_000 }));

    expect(await screen.findByRole('alert')).toHaveTextContent('asset synty/goblin.glb violates public-pack rule');
    expect(screen.getByRole('dialog', { name: 'Publish 3.0.0' })).toBeVisible();
    expect(screen.queryByText('These words will be public.')).not.toBeInTheDocument();
  });
});

function renderDialog({ publicRepo, onPublished = vi.fn() }: { publicRepo: boolean; onPublished?: () => void }) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PublishDialog
        gameId="game"
        buildId="build_one"
        publicRepo={publicRepo}
        onClose={vi.fn()}
        onPublished={onPublished}
      />
    </QueryClientProvider>,
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
