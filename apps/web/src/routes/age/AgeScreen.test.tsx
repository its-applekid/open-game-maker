import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  authFetch: vi.fn((input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, credentials: 'include' })),
  safeNext: (value: string | null, fallback: string) => value ?? fallback,
  useSession: vi.fn<() => { data: unknown; isPending: boolean }>(() => ({ data: null, isPending: false })),
}));

vi.mock('../../lib/api/auth', () => auth);

import { AgeScreen } from './AgeScreen';

function renderAge(entry = '/age') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/age" element={<AgeScreen />} />
        <Route path="/signin" element={<h1>Sign in destination</h1>} />
        <Route path="/games" element={<h1>Games destination</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  auth.useSession.mockReturnValue({ data: null, isPending: false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AgeScreen', { timeout: 10_000 }, () => {
  it('asks neutrally without revealing the threshold', () => {
    renderAge();

    expect(screen.getByRole('heading', { name: /when were you born/i })).toBeVisible();
    const copy = Array.from(document.querySelectorAll('h1, p, button, label > span'))
      .map((element) => element.textContent)
      .join(' ');
    expect(copy).not.toMatch(/\b18\b|adult/i);
    expect(screen.getByLabelText('Birth month')).toBeVisible();
    expect(screen.getByLabelText('Birth year')).toBeVisible();
  });

  it('posts the month and year and continues to next', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    renderAge('/age?next=%2Fgames');

    fireEvent.change(screen.getByLabelText('Birth month'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Birth year'), { target: { value: '1990' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('heading', { name: 'Games destination' })).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      '/auth/age',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ birthMonth: 5, birthYear: 1990 }),
      }),
    );
  });

  it('shows one neutral refusal line, removes the form, and stores nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'age_refused' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    const write = vi.spyOn(Storage.prototype, 'setItem');
    renderAge();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    const refusal = await screen.findByRole('status');
    expect(refusal).toHaveTextContent('This service is not available for you.');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
  });

  it('shows a retry after a network failure and then continues', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    renderAge();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Sign in destination' })).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('aborts a pending age request when the visitor leaves', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal?.reason), { once: true });
        });
      }),
    );
    const view = renderAge();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(signal).toBeDefined());
    view.unmount();

    expect(signal?.aborted).toBe(true);
  });

  it('continues immediately when a session already exists', async () => {
    auth.useSession.mockReturnValue({ data: { user: { id: 'u1' } }, isPending: false });
    renderAge('/age?next=%2Fgames');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Games destination' })).toBeVisible());
    expect(screen.queryByLabelText('Birth month')).not.toBeInTheDocument();
  });

  it('refreshes an expired age attestation for an existing session when required', async () => {
    auth.useSession.mockReturnValue({ data: { user: { id: 'u1' } }, isPending: false });
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    renderAge('/age?next=%2Fgames&attest=1');

    expect(screen.getByLabelText('Birth month')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('heading', { name: 'Games destination' })).toBeVisible();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
