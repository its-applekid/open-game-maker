import { describe, expect, it, vi } from 'vitest';

import { ViewportTracker } from './viewport.js';

describe('ViewportTracker', () => {
  it('sends the container size and safe-area probe insets', () => {
    const container = document.createElement('div');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });
    const send = vi.fn();
    const tracker = new ViewportTracker({
      container,
      send,
      raf: (callback) => {
        callback(0);
        return 1;
      },
      observe: () => () => undefined,
      readStyle: () => ({ paddingTop: '44px', paddingRight: '0px', paddingBottom: '34px', paddingLeft: '0px' }),
      dpr: () => 2,
    });
    tracker.sendNow();
    expect(send).toHaveBeenLastCalledWith({
      w: 800,
      h: 600,
      dpr: 2,
      orientation: 'landscape',
      safe: { top: 44, right: 0, bottom: 34, left: 0 },
    });
    tracker.dispose();
  });
});
