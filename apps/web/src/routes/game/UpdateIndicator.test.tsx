import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Release } from '@ogm/contracts/browser';

import { UpdateIndicator, type PublishedApi } from './UpdateIndicator';

const currentBuild = 'b_01BX5ZZKBKACTAV9WEVGEMMVRZ';
const nextBuild = 'b_01BX5ZZKBKACTAV9WEVGEMMVS0';
const release = (buildId: string) => ({ buildId }) as Release;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('UpdateIndicator', () => {
  it('keeps a matching ETag quiet, then shows one action for a changed release on visibility return', async () => {
    vi.useFakeTimers();
    const api = vi
      .fn<PublishedApi>()
      .mockResolvedValueOnce({ available: true, modified: true, etag: '"a"', value: release(currentBuild) })
      .mockResolvedValueOnce({ available: true, modified: false, etag: '"a"' })
      .mockResolvedValueOnce({ available: true, modified: true, etag: '"b"', value: release(nextBuild) });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });

    render(<UpdateIndicator api={api} currentBuildId={currentBuild} gameId="game" onUpdate={vi.fn()} />);
    await act(async () => Promise.resolve());
    expect(screen.queryByRole('button', { name: 'Update available' })).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });
    expect(api).toHaveBeenNthCalledWith(2, 'game', '"a"');
    expect(screen.queryByRole('button', { name: 'Update available' })).not.toBeInTheDocument();

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Update available' })).toBeVisible();
  });

  it('hides when the optional published route is unavailable', async () => {
    const api = vi.fn<PublishedApi>().mockResolvedValue({ available: false });
    render(<UpdateIndicator api={api} currentBuildId={currentBuild} gameId="game" onUpdate={vi.fn()} />);
    await act(async () => Promise.resolve());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('reports non-capability polling failures', async () => {
    const api = vi.fn<PublishedApi>().mockRejectedValue(new Error('offline'));
    const onError = vi.fn();
    render(
      <UpdateIndicator api={api} currentBuildId={currentBuild} gameId="game" onError={onError} onUpdate={vi.fn()} />,
    );

    await act(async () => Promise.resolve());

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'offline' }));
  });
});
