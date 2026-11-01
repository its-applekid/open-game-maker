import { describe, expect, it, vi } from 'vitest';

import { SettingsController } from './settings.js';

describe('SettingsController', () => {
  it('stores settings and resends them after a ready event', () => {
    const send = vi.fn();
    const settings = new SettingsController(send);
    const value = { mute: true, volume: 0.4, textScale: 1.2, reduceMotion: true };

    settings.set(value);
    settings.resend();

    expect(send).toHaveBeenNthCalledWith(1, value);
    expect(send).toHaveBeenNthCalledWith(2, value);
  });
});
