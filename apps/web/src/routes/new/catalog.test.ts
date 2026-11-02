import { describe, expect, it } from 'vitest';

import { styleChoices, type CatalogFamily } from './catalog';

const family: CatalogFamily = {
  id: 'isometric-2d',
  label: 'Isometric 2D',
  views: ['iso', 'follow'],
  creationChoice: true,
  packs: [],
  sets: [
    {
      id: 'public-set',
      label: 'Public set',
      vendors: ['kenney'],
      traits: {},
      packs: [],
    },
    {
      id: 'licensed-set',
      label: 'Licensed set',
      vendors: ['vendor'],
      traits: {},
      packs: [],
      requiresPrivate: true,
    },
  ],
};

describe('styleChoices', () => {
  it('uses each catalog set as one choice and carries its privacy requirement', () => {
    expect(styleChoices([family])).toEqual([
      expect.objectContaining({ id: 'public-set', familyId: 'isometric-2d', requiresPrivate: false }),
      expect.objectContaining({ id: 'licensed-set', familyId: 'isometric-2d', requiresPrivate: true }),
    ]);
  });
});
