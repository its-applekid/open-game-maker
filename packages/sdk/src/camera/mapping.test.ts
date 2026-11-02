import { describe, expect, it } from 'vitest';

import { defaultInputMapping } from './mapping.js';

describe('defaultInputMapping', () => {
  it('reserves pointer lock and two-stick touch for first-person play', () => {
    expect(defaultInputMapping('fps')).toMatchObject({ pointerLock: true, touch: 'two-stick' });
    expect(defaultInputMapping('iso')).toMatchObject({ pointerLock: false, touch: 'stick' });
    expect(defaultInputMapping('fixed')).toMatchObject({ pointerLock: false, touch: 'stick' });
  });

  it('merges manifest keyboard overrides without sharing mutable records', () => {
    const mapping = defaultInputMapping('iso', { keyboard: { Space: 'attack', KeyQ: 'dash' } });

    expect(mapping.keyboard).toMatchObject({ Space: 'attack', KeyQ: 'dash', KeyW: 'move.up' });
    expect(defaultInputMapping('iso').keyboard.Space).toBe('jump');
  });

  it('returns independent records for each rig instance', () => {
    const first = defaultInputMapping('follow');
    const second = defaultInputMapping('follow');

    first.keyboard.KeyW = 'custom';

    expect(second.keyboard.KeyW).toBe('move.up');
  });
});
