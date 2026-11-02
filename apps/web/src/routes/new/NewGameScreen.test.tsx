import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

import { NewGameScreen } from './NewGameScreen';

const catalog = [
  {
    id: 'isometric-2d',
    label: 'Isometric 2D',
    dimension: '2d',
    fidelity: 'pixel art',
    views: ['iso', 'follow'],
    creationChoice: true,
    coverage: { characters: true, environment: true, props: true, ui: false, sfx: false, music: false },
    packs: [],
    sets: [
      {
        id: 'smallscaleint',
        label: 'SmallScaleInt',
        vendors: ['smallscaleint'],
        traits: { perspective: 'isometric 2:1', judgment: 'one set' },
        packs: [
          {
            id: 'smallscaleint-knight',
            name: 'Knight',
            thumbnailUrl: '/knight.webp',
            compatibleWith: [],
          },
        ],
      },
    ],
  },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(catalog), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderScreen(entry = '/new?step=genre') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/new" element={<NewGameScreen />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function button(label: string): HTMLButtonElement {
  return screen.getByText(label, { selector: 'button, button *' }).closest('button') as HTMLButtonElement;
}

describe('NewGameScreen', () => {
  it('enforces pick limits and flips Other into a typed value', () => {
    renderScreen();

    for (const name of ['Shooter', 'Adventure', 'RPG']) fireEvent.click(button(name));
    fireEvent.click(button('Sports'));
    expect(button('Sports')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('Unpick one first');

    fireEvent.click(button('RPG'));
    fireEvent.click(button('Other'));
    fireEvent.click(screen.getByRole('button', { name: 'Type it' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Your own genre' }), { target: { value: 'Delivery' } });
    fireEvent.click(button('Add'));
    expect(screen.getByText('“Delivery”')).toBeVisible();
  }, 20_000);

  it('uses catalog sets as style choices and filters point of view', async () => {
    renderScreen();

    fireEvent.click(button('Platformer'));
    fireEvent.click(button('Next'));
    fireEvent.click(button('Skip'));

    const style = await screen.findByRole('button', { name: /SmallScaleInt/ });
    expect(screen.getByRole('img', { name: 'Knight preview' })).toHaveAttribute('src', '/knight.webp');
    fireEvent.click(style);
    fireEvent.click(button('Next'));
    fireEvent.click(button('Skip'));
    fireEvent.click(button('Solo'));
    fireEvent.click(button('Next'));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Follow' })).toBeVisible());
    expect(screen.queryByRole('button', { name: 'Isometric' })).not.toBeInTheDocument();
  });

  it('offers a working retry when game creation fails', async () => {
    let createCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const path = String(input);
        if (path.endsWith('/api/catalog/style-families')) {
          return Promise.resolve(
            new Response(JSON.stringify(catalog), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
        if (path.endsWith('/api/v1/games')) {
          createCalls += 1;
          return Promise.resolve(
            createCalls === 1
              ? new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 })
              : new Response(JSON.stringify({ id: 'g_2' }), {
                  status: 201,
                  headers: { 'content-type': 'application/json' },
                }),
          );
        }
        return Promise.resolve(new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }));
      }),
    );
    renderScreen('/new?step=talk');

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(createCalls).toBe(2));
  });
});
