import type { AssetCard } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { IsoMap, isoToWorld, paletteFrom, validatePlacement } from '../src/index.js';
import { fixtureMap4x4 } from './fixtures/map-4x4.js';

function card(id: string, title: string, facing = true): AssetCard {
  const layer = /(?:^|\s)(wall|door)(?:\s|$)/i.test(title)
    ? 'wall'
    : /(?:^|\s)ground(?:\s|$)/i.test(title)
      ? 'ground'
      : /(?:^|\s)roof(?:\s|$)/i.test(title)
        ? 'overlay'
        : 'decor';
  return {
    schema: 'ogm.asset-card/1.1',
    vocab: '2026-11-01',
    id,
    card_type: 'asset',
    status: 'measured',
    title,
    kind: 'sprite',
    subkind: 'tile',
    provenance: {},
    sprite: {
      drawn_view: 'iso',
      tile: { layer },
      ...(facing ? { facings: { E: `${id}_E.png`, N: `${id}_N.png`, S: `${id}_S.png`, W: `${id}_W.png` } } : {}),
    },
  };
}

describe('paletteFrom', () => {
  it('groups placeable facing cards by measured category with footprint and edge rules', () => {
    const palette = paletteFrom([
      card('chest-02', 'Chest 02'),
      card('wall-02', 'Wall 02'),
      card('flora-01', 'Flora 01'),
      card('door-01', 'Door 01'),
      card('wall-flora-01', 'WallFlora 01'),
      card('wall-01', 'Wall 01'),
    ]);
    expect(Object.keys(palette)).toEqual(['WallFlora', 'Wall', 'Door', 'Flora', 'Chest']);
    expect(palette.Wall!.map((item) => item.prefab)).toEqual(['wall-01', 'wall-02']);
    expect(palette.Wall![0]).toMatchObject({
      label: 'Wall 01',
      category: 'Wall',
      layer: 'wall',
      footprint: [1, 1],
      placement: 'edge',
    });
    expect(palette.Chest![0]).toMatchObject({ layer: 'decor', placement: 'cell' });
  });

  it('omits floor and roof painter pieces, non-facing cards, and collection cards', () => {
    const nonTile = card('chest-01', 'Chest 01');
    delete nonTile.sprite!.tile;
    expect(
      paletteFrom([
        card('ground-01', 'Ground 01'),
        card('roof-01', 'Roof 01'),
        card('stone-01', 'Stone 01', false),
        { ...card('tree-01', 'Tree 01'), card_type: 'collection' },
        nonTile,
      ]),
    ).toEqual({});
  });
});

describe('validatePlacement', () => {
  const map = new IsoMap(fixtureMap4x4());
  const pose = (isoX: number, isoY: number) => {
    const point = isoToWorld(isoX, isoY);
    return { position: [point.x, point.y, 0] as [number, number, number] };
  };

  it('accepts decor at the centre of an in-bounds floor tile', () => {
    expect(validatePlacement('chest-02', pose(2, 2), map)).toEqual({ ok: true });
  });

  it('rejects decor between cells or outside the floor', () => {
    expect(validatePlacement('chest-02', pose(1.5, 1), map)).toEqual({
      ok: false,
      reason: 'prefab must be centred on a floor tile',
    });
    expect(validatePlacement('chest-02', pose(4, 2), map)).toEqual({ ok: false, reason: 'outside map floor' });
  });

  it('accepts walls and doors only on a floor grid edge', () => {
    expect(validatePlacement('wall-02', pose(1, 1.5), map)).toEqual({ ok: true });
    expect(validatePlacement('door-01', pose(2.5, 2), map)).toEqual({ ok: true });
    expect(validatePlacement('wall-02', pose(1, 1), map)).toEqual({
      ok: false,
      reason: 'wall prefabs must be centred on a grid edge',
    });
    expect(validatePlacement('wall-02', pose(4.5, 2), map)).toEqual({ ok: false, reason: 'outside map floor' });
  });

  it('rejects unknown and hidden painter prefabs', () => {
    expect(validatePlacement('not-a-smallscale-piece', pose(1, 1), map)).toEqual({
      ok: false,
      reason: 'unknown prefab',
    });
    expect(validatePlacement('notwallflora-piece', pose(1, 1), map)).toEqual({ ok: false, reason: 'unknown prefab' });
    expect(validatePlacement('ground-01', pose(1, 1), map)).toEqual({ ok: false, reason: 'unknown prefab' });
    expect(validatePlacement('roof-01', pose(1, 1), map)).toEqual({ ok: false, reason: 'unknown prefab' });
  });
});
