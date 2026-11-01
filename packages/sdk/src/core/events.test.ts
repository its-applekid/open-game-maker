import { describe, expect, it } from 'vitest';

import { EventRing } from './events.js';

describe('EventRing', () => {
  it('returns only events newer than the cursor', () => {
    const events = new EventRing(3);
    events.push(1, 'start');
    events.push(2, 'step', { tick: 1 });
    events.push(3, 'step', { tick: 2 });

    expect(events.since(1)).toEqual([
      { t: 2, type: 'step', data: { tick: 1 } },
      { t: 3, type: 'step', data: { tick: 2 } },
    ]);
  });

  it('drops the oldest entry at capacity', () => {
    const events = new EventRing(2);
    events.push(1, 'one');
    events.push(2, 'two');
    events.push(3, 'three');

    expect(events.since(0).map(({ type }) => type)).toEqual(['two', 'three']);
  });
});
