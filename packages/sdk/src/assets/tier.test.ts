import { afterEach, describe, expect, it, vi } from 'vitest';

import { DPR_CAP, pickTier, readSignals, rememberTier } from './tier.js';

describe('pickTier', () => {
  it.each([
    [
      'desktop for a well-equipped non-coarse device',
      { coarse: false, iOS: false, deviceMemory: 8, hardwareConcurrency: 8, dpr: 2 },
      'desktop',
    ],
    [
      'mobile for coarse iOS without a memory signal',
      { coarse: true, iOS: true, hardwareConcurrency: 2, dpr: 3 },
      'mobile',
    ],
    ['low for a two-core coarse Android device', { coarse: true, iOS: false, hardwareConcurrency: 2, dpr: 2 }, 'low'],
  ] as const)('%s', (_name, signals, expected) => {
    expect(pickTier(signals)).toBe(expected);
  });

  it('prefers an explicit override to the remembered tier', () => {
    expect(
      pickTier({
        coarse: false,
        iOS: false,
        deviceMemory: 8,
        hardwareConcurrency: 8,
        dpr: 2,
        override: 'low',
        remembered: 'desktop',
      }),
    ).toBe('low');
  });

  it('uses a remembered tier before computing a new one', () => {
    expect(
      pickTier({
        coarse: false,
        iOS: false,
        deviceMemory: 8,
        hardwareConcurrency: 8,
        dpr: 2,
        remembered: 'mobile',
      }),
    ).toBe('mobile');
  });

  it('exposes the researched DPR caps', () => {
    expect(DPR_CAP).toEqual({ desktop: 2, mobile: 1.5, low: 1 });
  });
});

describe('browser tier signals', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads coarse iOS signals and validates the query override', () => {
    const getItem = vi.fn(() => 'desktop');
    const win = {
      devicePixelRatio: 3,
      location: { search: '?tier=low' },
      localStorage: { getItem },
      matchMedia: vi.fn(() => ({ matches: true })),
      navigator: {
        deviceMemory: undefined,
        hardwareConcurrency: 4,
        maxTouchPoints: 5,
        userAgent: 'Mozilla/5.0 (Macintosh)',
      },
    } as unknown as Window;

    expect(readSignals(win)).toEqual({
      coarse: true,
      iOS: true,
      deviceMemory: undefined,
      hardwareConcurrency: 4,
      dpr: 3,
      override: 'low',
      remembered: 'desktop',
    });
  });

  it('ignores invalid overrides and storage read failures', () => {
    const win = {
      devicePixelRatio: 1,
      location: { search: '?tier=ultra' },
      localStorage: {
        getItem: vi.fn(() => {
          throw new DOMException('blocked');
        }),
      },
      matchMedia: vi.fn(() => ({ matches: false })),
      navigator: { hardwareConcurrency: 8, maxTouchPoints: 0, userAgent: 'Desktop' },
    } as unknown as Window;

    expect(readSignals(win)).toMatchObject({ override: null, remembered: null });
  });

  it('remembers a computed tier but never the testing override', () => {
    const storage = { setItem: vi.fn() } as unknown as Storage;

    rememberTier('mobile', null, storage);
    rememberTier('low', 'low', storage);

    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(storage.setItem).toHaveBeenCalledWith('gm.tier', 'mobile');
  });

  it('tolerates storage write failures', () => {
    const storage = {
      setItem: vi.fn(() => {
        throw new DOMException('blocked');
      }),
    } as unknown as Storage;

    expect(() => rememberTier('desktop', null, storage)).not.toThrow();
  });
});
