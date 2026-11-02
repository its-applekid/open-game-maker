import { afterEach, describe, expect, it, vi } from 'vitest';

import { glideTiles, type TileRects } from './flip';

afterEach(() => vi.unstubAllGlobals());

describe('glideTiles', () => {
  it('does not animate reordered tiles when reduced motion is requested', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    const tile = document.createElement('div');
    tile.dataset.gameId = 'g_1';
    tile.animate = vi.fn();
    tile.getBoundingClientRect = vi.fn(() => ({ left: 20, top: 0, bottom: 100 }) as DOMRect);
    const container = document.createElement('div');
    container.append(tile);
    const before: TileRects = new Map([['g_1', { left: 0, top: 0 } as DOMRect]]);

    glideTiles(container, before);

    expect(tile.animate).not.toHaveBeenCalled();
  });
});
