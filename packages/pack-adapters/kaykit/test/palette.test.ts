import { afterEach, expect, it, vi } from 'vitest';

import { kitPalette } from '../src/palette.js';
import { fixtureLoader } from './fixtures/manifest.js';

afterEach(() => vi.unstubAllGlobals());

it('lists every kit piece in the manifest by piece then id, and nothing else', async () => {
  const { loader } = await fixtureLoader({
    'wall-b': { meta: { kit: { piece: 'wall', grid_m: 4 } } },
    'wall-a': { meta: { kit: { piece: 'wall', grid_m: 4 } } },
    floor: { meta: { kit: { piece: 'floor', grid_m: 2 } } },
    barrel: {},
  });
  expect(kitPalette(await loader.load())).toEqual([
    { id: 'floor', piece: 'floor', gridM: 2 },
    { id: 'wall-a', piece: 'wall', gridM: 4 },
    { id: 'wall-b', piece: 'wall', gridM: 4 },
  ]);
});
