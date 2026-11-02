import { beforeEach, describe, expect, it } from 'vitest';

import { loadSnapPrefs, saveSnapPrefs } from './SnapPrefs';

beforeEach(() => localStorage.clear());

describe('snap preferences', () => {
  it('falls back safely from malformed device storage', () => {
    localStorage.setItem('ogm.editor.snap.game', '{broken');

    expect(loadSnapPrefs('game', 2)).toEqual({ version: 1, enabled: true, grid: 2 });
  });

  it('persists a versioned per-game preference outside design history', () => {
    saveSnapPrefs('game', { version: 1, enabled: false, grid: 0.5 });

    expect(loadSnapPrefs('game', 1)).toEqual({ version: 1, enabled: false, grid: 0.5 });
    expect(JSON.parse(localStorage.getItem('ogm.editor.snap.game') ?? '')).toEqual({
      version: 1,
      enabled: false,
      grid: 0.5,
    });
  });

  it('does not interrupt editing when device storage rejects writes', () => {
    const storage = { setItem: () => { throw new Error('denied'); } } as unknown as Storage;

    expect(() => saveSnapPrefs('game', { version: 1, enabled: false, grid: 1 }, storage)).not.toThrow();
  });
});
