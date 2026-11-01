import { describe, expect, it } from 'vitest';

import { validateCard, validateLayoutSpec } from '../src/card.js';
import type { Sprite } from '../src/card.generated.js';
import { cardFixtureDocs, negativeFixture } from './helpers.js';

describe('card schemas', () => {
  it('accepts all 16 moved C3 fixtures', () => {
    for (const { file, doc } of cardFixtureDocs()) {
      const schema = (doc as { schema?: string }).schema;
      const result = schema?.startsWith('ogm.map-layout-spec') ? validateLayoutSpec(doc) : validateCard(doc);
      expect(result, file).toMatchObject({ ok: true });
    }
  });

  it('accepts 1.1 processing and rejects unknown processing modes', () => {
    const card = structuredClone(
      cardFixtureDocs().find(({ file }) => file === 'collection-kenney-mini-dungeon.json')?.doc,
    );
    expect(validateCard(card)).toMatchObject({ ok: true });

    (card as { rights: { processing: string } }).rights.processing = 'cloud';
    const result = validateCard(card);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('processing');
  });

  it('accepts a collection card compatibility set', () => {
    const card = structuredClone(
      cardFixtureDocs().find(({ file }) => file === 'collection-kenney-mini-dungeon.json')?.doc,
    ) as { describe: { set?: string } };
    card.describe.set = 'kenney-mini-3d';
    expect(validateCard(card)).toMatchObject({ ok: true });
  });

  it('accepts deterministic sprite sources and rejects unsafe source paths', () => {
    const card = structuredClone(
      cardFixtureDocs().find(({ file }) => file === 'sprite-kenney-tiny-dungeon-knight.json')?.doc,
    ) as {
      describe: { world?: string };
      sprite: Record<string, unknown>;
    };
    card.describe.world = 'fantasy';
    card.sprite.animations = [
      {
        name: 'attack',
        frames: [0, 1],
        fps: 12,
        directions: ['E', 'N', 'S', 'W'],
        sheets: [
          {
            path: 'Spritesheets/Shadowless/Knight/Attack.png',
            variant: 'shadowless',
            frame_w: 64,
            frame_h: 64,
            cols: 2,
            rows: 4,
          },
        ],
        direction_files: {
          S: ['Knight/Attack/S/0.png', 'Knight/Attack/S/1.png'],
        },
      },
    ];
    card.sprite.facings = { E: 'Tiles/chest_E.png', N: 'Tiles/chest_N.png' };
    expect(validateCard(card)).toMatchObject({ ok: true });

    (card.sprite.animations as Array<{ frames: number[]; fps: number }>)[0]!.frames = [];
    (card.sprite.animations as Array<{ frames: number[]; fps: number }>)[0]!.fps = 0;
    expect(validateCard(card)).toMatchObject({ ok: true });

    const typoFacing: Sprite = {
      drawn_view: 'iso',
      facings: {
        // @ts-expect-error Direction maps reject misspelled keys at compile time.
        SOUTH: 'Tiles/chest_S.png',
      },
    };
    expect(typoFacing.facings).toBeDefined();

    (card.sprite.animations as Array<{ sheets: Array<{ path: string }> }>)[0]!.sheets[0]!.path = '../outside.png';
    const result = validateCard(card);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('path');
  });

  it('reports the invalid interpretation author', () => {
    const result = validateCard(negativeFixture('interpretation-not-admin.json').doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toContain('set_by');
  });
});
