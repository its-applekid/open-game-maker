import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FRAME_SAMPLE_COUNT, SLOW_FRAME_MEDIAN_MS, FrameGovernor } from './governor.js';

describe('FrameGovernor', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('waits for 60 samples, then lowers DPR exactly once', () => {
    const governor = new FrameGovernor({ tier: 'desktop', dpr: 2, storage: localStorage });
    const onChange = vi.fn();
    governor.onChange(onChange);

    for (let frame = 0; frame < FRAME_SAMPLE_COUNT - 1; frame += 1) governor.observe(23);
    expect(governor.state).toEqual({ tier: 'desktop', dpr: 2, effects: true });

    governor.observe(SLOW_FRAME_MEDIAN_MS + 1);

    expect(governor.state).toEqual({ tier: 'desktop', dpr: 1.5, effects: true });
    expect(onChange).toHaveBeenCalledOnce();
    expect(JSON.parse(localStorage.getItem('gm.tier.adapted') ?? '')).toEqual({ dpr: 1.5, effects: true });
  });

  it('disables effects at minimum DPR and never changes again', () => {
    const governor = new FrameGovernor({ tier: 'low', dpr: 1, storage: localStorage });
    const onChange = vi.fn();
    governor.onChange(onChange);

    for (let frame = 0; frame < FRAME_SAMPLE_COUNT * 2; frame += 1) governor.observe(30);

    expect(governor.state).toEqual({ tier: 'low', dpr: 1, effects: false });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('restores only lower persisted settings', () => {
    localStorage.setItem('gm.tier.adapted', JSON.stringify({ dpr: 1.25, effects: true }));
    expect(new FrameGovernor({ tier: 'desktop', dpr: 2, storage: localStorage }).state.dpr).toBe(1.25);

    localStorage.setItem('gm.tier.adapted', JSON.stringify({ dpr: 2, effects: true }));
    expect(new FrameGovernor({ tier: 'mobile', dpr: 1.5, storage: localStorage }).state.dpr).toBe(1.5);
  });

  it('does not change for a fast sample window', () => {
    const governor = new FrameGovernor({ tier: 'mobile', dpr: 1.5, storage: localStorage });
    const onChange = vi.fn();
    governor.onChange(onChange);

    for (let frame = 0; frame < FRAME_SAMPLE_COUNT; frame += 1) governor.observe(16);

    expect(governor.state).toEqual({ tier: 'mobile', dpr: 1.5, effects: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tolerates unavailable storage and allows listeners to unsubscribe', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new DOMException('blocked');
      }),
      setItem: vi.fn(() => {
        throw new DOMException('blocked');
      }),
    } as unknown as Storage;
    const governor = new FrameGovernor({ tier: 'desktop', dpr: 2, storage });
    const onChange = vi.fn();
    const unsubscribe = governor.onChange(onChange);
    unsubscribe();

    expect(() => {
      for (let frame = 0; frame < FRAME_SAMPLE_COUNT; frame += 1) governor.observe(30);
    }).not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });
});
