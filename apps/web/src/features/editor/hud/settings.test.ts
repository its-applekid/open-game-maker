import { beforeEach, describe, expect, it } from 'vitest';

import { loadSettings, saveSettings } from './settings';

beforeEach(() => localStorage.clear());

describe('player settings', () => {
  it('falls back safely from malformed storage and honors first-run reduced motion', () => {
    localStorage.setItem('ogm.settings', '{bad json');
    expect(loadSettings(localStorage, () => true)).toEqual({
      mute: false,
      volume: 1,
      textScale: 1,
      reduceMotion: true,
    });
  });

  it('persists bounded settings and reads them without consulting media defaults again', () => {
    saveSettings({ mute: true, volume: 4, textScale: 0.2, reduceMotion: false });

    expect(loadSettings(localStorage, () => true)).toEqual({
      mute: true,
      volume: 1,
      textScale: 0.75,
      reduceMotion: false,
    });
  });
});
