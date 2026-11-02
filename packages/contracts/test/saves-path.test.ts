import { describe, expect, it } from 'vitest';

import { SAVES_ROUTE, savesPath } from '../src/saves.js';

// The web client and the API both build save URLs from these; a drift here is the 404 that hid every save (#281).
describe('saves path', () => {
  it('nests saves under their game', () => {
    expect(SAVES_ROUTE).toBe('/games/:gameId/saves');
    expect(savesPath('g_1')).toBe('/games/g_1/saves');
    expect(savesPath('g_1', '2')).toBe('/games/g_1/saves/2');
  });

  it('fills the route pattern the API mounts', () => {
    expect(savesPath('g_1')).toBe(SAVES_ROUTE.replace(':gameId', 'g_1'));
  });
});
