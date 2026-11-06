import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { countGridTracks, useGridCapacity } from './useGridCapacity';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('countGridTracks', () => {
  it('counts the resolved columns from the rendered CSS grid', () => {
    expect(countGridTracks('319.5px 319.5px 319.5px')).toBe(3);
    expect(countGridTracks('195px 195px')).toBe(2);
  });

  it('expands fixed repeat syntax but waits for the browser to resolve auto-fill', () => {
    expect(countGridTracks('repeat(2, minmax(0px, 1fr))')).toBe(2);
    expect(countGridTracks('repeat(auto-fill, minmax(320px, 1fr))')).toBe(0);
    expect(countGridTracks('none')).toBe(0);
  });
});

describe('useGridCapacity', () => {
  it('updates through the window resize fallback and removes its listener', () => {
    let template = '320px 320px';
    vi.stubGlobal('ResizeObserver', undefined);
    vi.stubGlobal(
      'getComputedStyle',
      vi.fn(() => ({ gridTemplateColumns: template })),
    );
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const ref = { current: document.createElement('div') };

    const { result, unmount } = renderHook(() => useGridCapacity(ref, true));
    expect(result.current).toBe(2);

    template = '320px 320px 320px';
    act(() => window.dispatchEvent(new Event('resize')));
    expect(result.current).toBe(3);

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('updates from ResizeObserver and disconnects it on cleanup', () => {
    let template = '320px 320px';
    let resize!: ResizeObserverCallback;
    const observe = vi.fn();
    const disconnect = vi.fn();
    class TestResizeObserver {
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();

      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
    }
    vi.stubGlobal(
      'getComputedStyle',
      vi.fn(() => ({ gridTemplateColumns: template })),
    );
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    const ref = { current: document.createElement('div') };

    const { result, unmount } = renderHook(() => useGridCapacity(ref, true));
    expect(result.current).toBe(2);
    expect(observe).toHaveBeenCalledWith(ref.current);

    template = '320px 320px 320px';
    act(() => resize([], {} as ResizeObserver));
    expect(result.current).toBe(3);

    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
