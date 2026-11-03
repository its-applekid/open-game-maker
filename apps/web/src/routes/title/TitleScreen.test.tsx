import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sound = vi.hoisted(() => ({
  set: vi.fn(),
  unlock: vi.fn(),
}));

vi.mock('../../lib/api/session', () => ({ useSession: () => ({ data: null }) }));
vi.mock('../../lib/input', () => ({
  FocusZone: ({ children, className }: { children: ReactNode; className: string }) => (
    <div className={className}>{children}</div>
  ),
  useFocusable: () => ({ ref: null }),
  useInitialFocus: () => undefined,
}));
vi.mock('../../lib/sound', () => ({
  getVolume: () => 1,
  onChange: () => () => undefined,
  set: sound.set,
  setMuted: vi.fn(),
  setVolume: vi.fn(),
  status: () => 'tap',
  unlock: sound.unlock,
}));
vi.mock('./TitleTown', () => ({ TitleTown: () => <div className="title-town" /> }));

import { TitleScreen } from './TitleScreen';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('never-match'), media: query }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TitleScreen', () => {
  it('fades once over the live town before routing and leaves sound usable during the fade', async () => {
    const router = createMemoryRouter(
      [
        { path: '/', element: <TitleScreen /> },
        { path: '/age', element: <h1>Age check</h1> },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);

    const start = screen.getByRole('button', { name: 'Start' });
    fireEvent.click(start);
    fireEvent.click(start);

    expect(document.querySelector('.title-screen')).toHaveClass('leaving');
    expect(sound.unlock).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /sound/i })).toBeVisible();
    expect(router.state.location.pathname).toBe('/');

    act(() => vi.advanceTimersByTime(449));
    expect(router.state.location.pathname).toBe('/');
    await act(async () => vi.advanceTimersByTime(1));
    expect(router.state.location.pathname).toBe('/age');
  });

  it('routes without a delay when reduced motion is requested', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }));
    const router = createMemoryRouter(
      [
        { path: '/', element: <TitleScreen /> },
        { path: '/age', element: <h1>Age check</h1> },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await act(async () => vi.advanceTimersByTime(0));

    expect(router.state.location.pathname).toBe('/age');
  });
});
