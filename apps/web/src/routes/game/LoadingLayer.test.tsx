import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoadingLayer } from './LoadingLayer';

const game = { familyId: 'f_goblins', title: 'Goblin Cellar' };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('LoadingLayer', () => {
  it('waits 150 ms, then exposes byte progress as a percentage', () => {
    vi.useFakeTimers();
    const view = render(<LoadingLayer game={game} load={{ phase: 'ready', loaded: 0, total: 100, done: false }} />);

    expect(view.container.querySelector('[role="progressbar"][aria-label="Loading"]')).toBeNull();
    act(() => vi.advanceTimersByTime(150));
    expect(view.container.querySelector('[role="progressbar"][aria-label="Loading"]')).toHaveAttribute(
      'aria-valuenow',
      '0',
    );

    view.rerender(<LoadingLayer game={game} load={{ phase: 'ready', loaded: 50, total: 100, done: false }} />);
    expect(view.container.querySelector('[role="progressbar"][aria-label="Loading"]')).toHaveAttribute(
      'aria-valuenow',
      '50',
    );

    view.rerender(<LoadingLayer game={game} load={{ phase: 'ready', loaded: 100, total: 100, done: false }} />);
    expect(view.container.querySelector('[role="progressbar"][aria-label="Loading"]')).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
  });

  it('renders nothing when load.done arrives inside the delay', () => {
    vi.useFakeTimers();
    const view = render(<LoadingLayer game={game} />);

    act(() => vi.advanceTimersByTime(100));
    view.rerender(<LoadingLayer game={game} load={{ phase: 'ready', loaded: 0, total: 0, done: true }} />);
    act(() => vi.advanceTimersByTime(100));

    expect(view.container.querySelector('[role="progressbar"][aria-label="Loading"]')).toBeNull();
  });

  it('keeps the layer over the live game for its fade, then removes it', () => {
    vi.useFakeTimers();
    const view = render(<LoadingLayer game={game} load={{ phase: 'ready', loaded: 50, total: 100, done: false }} />);
    act(() => vi.advanceTimersByTime(150));

    view.rerender(<LoadingLayer game={game} load={{ phase: 'ready', loaded: 50, total: 100, done: true }} />);
    expect(view.container.querySelector('[role="progressbar"]')?.closest('.game-loading-layer')).toHaveClass('is-done');

    act(() => vi.advanceTimersByTime(250));
    expect(view.container.querySelector('[role="progressbar"][aria-label="Loading"]')).toBeNull();
  });

  it('removes the layer without a fade when reduced motion is requested', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    const view = render(
      <LoadingLayer game={game} load={{ phase: 'ready', loaded: 50, total: 100, done: false }} />,
    );
    act(() => vi.advanceTimersByTime(150));

    view.rerender(
      <LoadingLayer game={game} load={{ phase: 'ready', loaded: 50, total: 100, done: true }} />,
    );

    expect(view.container.querySelector('[role="progressbar"][aria-label="Loading"]')).toBeNull();
  });
});
