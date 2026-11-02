import { describe, expect, it, vi } from 'vitest';

import { createAnalytics } from './analytics.js';

function host() {
  return { events: { emit: vi.fn() } };
}

describe('analytics SDK', () => {
  it('emits the four-call vocabulary with only scoped fields', () => {
    const target = host();
    const analytics = createAnalytics(target);

    analytics.attemptStart('level-3');
    analytics.marker('castle-gate');
    analytics.attemptEnd('level-3', 'fail', 'castle-gate');
    analytics.complete();

    expect(target.events.emit.mock.calls).toEqual([
      ['analytics', { name: 'attempt_start', scope: 'level-3' }],
      ['analytics', { name: 'marker', marker: 'castle-gate' }],
      ['analytics', { name: 'attempt_end', scope: 'level-3', outcome: 'fail', marker: 'castle-gate' }],
      ['analytics', { name: 'complete' }],
    ]);
  });

  it('warns and drops an attempt end without a matching start', () => {
    const target = host();
    const warn = vi.fn();
    const analytics = createAnalytics(target, { warn });

    analytics.attemptEnd('level-3', 'quit');

    expect(target.events.emit).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('analytics.attemptEnd dropped without attemptStart: level-3');
  });
});
