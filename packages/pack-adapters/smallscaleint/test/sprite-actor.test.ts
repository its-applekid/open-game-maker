import { describe, expect, it } from 'vitest';

import { DIRECTIONS, createSpriteActor, facing8, type Direction } from '../src/index.js';
import { drawSheet, fakeLoader, fakeScene, type SyntheticSheet } from './fake-scene.js';

/** The pack's row order as measured on real sheets (E first, then clockwise on screen). */
const MEASURED_ROWS: Direction[] = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
const BASE = 'https://game.test/assets/';
const FPS = 12;

function card(frame: number, names: string[]) {
  const sheets = new Map<string, SyntheticSheet>();
  const animations = names.map((name) => {
    const geometry = { frame_w: frame, frame_h: frame, cols: 15, rows: 8 };
    sheets.set(`${BASE}${name}.png`, drawSheet(frame));
    sheets.set(`${BASE}${name}_Shadowless.png`, drawSheet(frame));
    return {
      name: name.toLowerCase(),
      frames: [...Array(15).keys()],
      fps: FPS,
      sheets: [
        { path: `Spritesheets/With shadows/${name}.png`, variant: 'shadow', ...geometry },
        { path: `Spritesheets/Shadowless/${name}_Shadowless.png`, variant: 'shadowless', ...geometry },
      ],
    };
  });
  return { sheets, loader: fakeLoader({ meta: { sprite: { drawn_view: 'iso', animations } } as never }) };
}

async function actor(frame: number, names: string[], variant: 'shadow' | 'shadowless' = 'shadow') {
  const { sheets, loader } = card(frame, names);
  const fake = fakeScene(sheets);
  const bound = await createSpriteActor(fake.scene, loader, 'hero', { variant });
  return { ...fake, actor: bound };
}

describe.each([128, 64])('createSpriteActor on a %i px sheet', (frame) => {
  it('maps every action, direction and frame to its drawn cell', async () => {
    const actions = { walk: 'Walk', 'attack.melee.1': 'Melee', die: 'Die' } as const;
    const { actor: bound, sprite, cell, loaded } = await actor(frame, Object.values(actions));
    expect([...loaded.values()].every((file) => file.frameWidth === frame && file.frameHeight === frame)).toBe(true);

    for (const [role, name] of Object.entries(actions)) {
      for (const facing of DIRECTIONS) {
        for (let f = 0; f < 15; f += 1) {
          bound.sync({ x: 3, y: 40, facing, action: role, t: (f + 0.5) / FPS });
          expect(cell(sprite.texture, sprite.frame)).toEqual({
            url: `${BASE}${name}.png`,
            row: MEASURED_ROWS.indexOf(facing),
            col: f,
          });
        }
      }
    }
    expect([sprite.x, sprite.y, sprite.depth]).toEqual([3, 40, 40]);
  });
});

describe('createSpriteActor', () => {
  it('loads only the requested variant', async () => {
    const { loaded } = await actor(64, ['Walk'], 'shadowless');
    expect([...loaded.values()].map((file) => file.url)).toEqual([`${BASE}Walk_Shadowless.png`]);
  });

  it('builds one animation per action and direction from the measured rows', async () => {
    const { actor: bound, animations } = await actor(128, ['Walk', 'Die']);
    expect(animations.size).toBe(16);
    const walkNorth = animations.get(bound.animationKey('walk', 'N'))!;
    expect(walkNorth).toEqual({ frames: [...Array(15).keys()].map((f) => 90 + f), frameRate: FPS, repeat: -1 });
    expect(animations.get(bound.animationKey('die', 'E'))!.repeat).toBe(0);
  });

  it('loops a loop role and holds a one-shot on its last frame past the end', async () => {
    const { actor: bound, sprite } = await actor(64, ['Walk', 'Die']);
    const t = 20.5 / FPS;
    bound.sync({ x: 0, y: 0, facing: 'E', action: 'walk', t });
    expect(sprite.frame).toBe(5);
    bound.sync({ x: 0, y: 0, facing: 'E', action: 'die', t });
    expect(sprite.frame).toBe(14);
    bound.sync({ x: 0, y: 0, facing: 'E', action: 'die', t: 60 });
    expect(sprite.frame).toBe(14);
  });

  it('accepts a set action name and falls back to the next name a role lists', async () => {
    const { actor: bound, sprite, cell } = await actor(64, ['Idle2']);
    bound.sync({ x: 0, y: 0, facing: 'S', action: 'idle', t: 0 });
    expect(cell(sprite.texture, sprite.frame).url).toBe(`${BASE}Idle2.png`);
    bound.sync({ x: 0, y: 0, facing: 'S', action: 'Idle2', t: 16 / FPS });
    expect(sprite.frame).toBe(2 * 15 + 1);
  });

  it('refuses an asset without SmallScaleInt sheet metadata', async () => {
    const { scene } = fakeScene(new Map());
    await expect(createSpriteActor(scene, fakeLoader({}), 'hero', { variant: 'shadow' })).rejects.toThrow(
      /no SmallScaleInt sheet metadata/,
    );
  });
});

describe('facing8', () => {
  const at = (degrees: number): [number, number] => [
    Math.cos((degrees * Math.PI) / 180),
    -Math.sin((degrees * Math.PI) / 180),
  ];

  it('reads screen velocity with y down using the pack angles', () => {
    expect(facing8(1, 0)).toBe('E');
    expect(facing8(0, -1)).toBe('N');
    expect(facing8(0, 1)).toBe('S');
    expect(facing8(...at(135))).toBe('NW');
    expect(facing8(...at(315))).toBe('SE');
    expect(facing8(0, 0)).toBeUndefined();
    expect(facing8(0, 0, { previous: 'W', degrees: 5 })).toBe('W');
  });

  it('does not flip on a wobble across a sector edge', () => {
    let facing = facing8(...at(21.5));
    expect(facing).toBe('E');
    for (const degrees of [23.5, 21.5, 24, 22]) {
      facing = facing8(...at(degrees), { previous: facing!, degrees: 5 });
      expect(facing).toBe('E');
    }
    expect(facing8(...at(23.5))).toBe('NE');
    expect(facing8(...at(30), { previous: 'E', degrees: 5 })).toBe('NE');
  });
});
