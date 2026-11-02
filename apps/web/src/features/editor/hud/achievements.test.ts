import { describe, expect, it, vi } from 'vitest';

import { handleGameEvent } from './achievements';

describe('game achievements', () => {
  it('marks draft achievement toasts as tests without writing achievement storage', () => {
    const toast = vi.fn();
    const store = vi.fn();

    handleGameEvent('achievement', { title: 'Found the key' }, 'draft', toast);

    expect(toast).toHaveBeenCalledWith('Found the key (test)');
    expect(store).not.toHaveBeenCalled();
  });

  it('ignores non-achievement game events', () => {
    const toast = vi.fn();
    handleGameEvent('analytics', { title: 'Not a toast' }, 'published', toast);
    expect(toast).not.toHaveBeenCalled();
  });
});
