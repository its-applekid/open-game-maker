import type { AssetLoader } from '@gm/sdk/assets';
import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';

import { DIRECTIONS4, createSpriteActor4, facing4, type Direction4 } from '../src/index.js';

/** A synthetic sheet: frame index → the number drawn in that cell, `row * 100 + col`. */
function numberedCell(frame: number, cols: number): number {
  return Math.floor(frame / cols) * 100 + (frame % cols);
}

function fakeScene(urls: Set<string>) {
  const loaded = new Map<string, string>();
  const pending: [string, string][] = [];
  const listeners = new Map<string, ((arg?: unknown) => void)[]>();
  const emit = (event: string, arg?: unknown) => [...(listeners.get(event) ?? [])].forEach((l) => l(arg));
  const sprite = {
    frame: -1,
    x: 0,
    y: 0,
    depth: 0,
    origin: [0, 0],
    setFrame(frame: number) {
      sprite.frame = frame;
    },
    setPosition(x: number, y: number) {
      sprite.x = x;
      sprite.y = y;
    },
    setDepth(depth: number) {
      sprite.depth = depth;
    },
    setOrigin(x: number, y: number) {
      sprite.origin = [x, y];
    },
  };
  const configs: unknown[] = [];
  const load = {
    spritesheet: (key: string, url: string, config: unknown) => {
      pending.push([key, url]);
      configs.push(config);
    },
    on: (event: string, cb: (arg?: unknown) => void) =>
      void listeners.set(event, [...(listeners.get(event) ?? []), cb]),
    once: (event: string, cb: (arg?: unknown) => void) => {
      const once = (arg?: unknown) => {
        load.off(event, once);
        cb(arg);
      };
      load.on(event, once);
    },
    off: (event: string, cb: (arg?: unknown) => void) =>
      void listeners.set(
        event,
        (listeners.get(event) ?? []).filter((l) => l !== cb),
      ),
    start: () => {
      for (const [key, url] of pending.splice(0)) {
        if (urls.has(url)) loaded.set(key, url);
        else emit('loaderror', { key });
      }
      emit('complete');
    },
  };
  const scene = {
    load,
    textures: { exists: (key: string) => loaded.has(key) },
    add: {
      sprite: (_x: number, _y: number, _key: string, frame: number) => {
        sprite.setFrame(frame);
        return sprite;
      },
    },
  };
  return { scene: scene as unknown as Phaser.Scene, sprite, configs };
}

function loader(
  sheet:
    | { frame_w: number; frame_h: number; cols: number; rows: number; margin_px?: number; spacing_px?: number }
    | undefined,
): AssetLoader {
  return {
    resolve: () => ({
      url: 'https://game.test/a.png',
      file: 'a.png',
      license: {},
      meta: sheet ? { sprite: { drawn_view: 'topdown', sheet } } : undefined,
    }),
  } as unknown as AssetLoader;
}

const SINGLE = { frame_w: 48, frame_h: 48, cols: 3, rows: 4 };
const ROW: Record<Direction4, number> = { down: 0, left: 1, right: 2, up: 3 };

describe('createSpriteActor4', () => {
  it('plays walk as columns 0,1,2,1 on the row of its facing, rows down/left/right/up', async () => {
    const { scene, sprite } = fakeScene(new Set(['https://game.test/a.png']));
    const actor = await createSpriteActor4(scene, loader(SINGLE), 'a', { fps: 4 });
    for (const facing of DIRECTIONS4) {
      const cols = [0, 1, 2, 3, 4].map((step) => {
        actor.sync({ x: 10, y: 20, facing, role: 'walk', t: step / 4 });
        return numberedCell(sprite.frame, 3);
      });
      expect(cols, facing).toEqual([0, 1, 2, 1, 0].map((c) => ROW[facing] * 100 + c));
    }
  });

  it('holds the standing column for idle and sets position, feet origin and depth from y', async () => {
    const { scene, sprite } = fakeScene(new Set(['https://game.test/a.png']));
    const actor = await createSpriteActor4(scene, loader(SINGLE), 'a', { fps: 6 });
    actor.sync({ x: 5, y: 70, facing: 'up', role: 'idle', t: 3.3 });
    expect(numberedCell(sprite.frame, 3)).toBe(301);
    expect(sprite).toMatchObject({ x: 5, y: 70, depth: 70, origin: [0.5, 1] });
  });

  it('picks one character out of an 8-character sheet (4 x 2 blocks)', async () => {
    const { scene, sprite } = fakeScene(new Set(['https://game.test/a.png']));
    const actor = await createSpriteActor4(scene, loader({ frame_w: 48, frame_h: 48, cols: 12, rows: 8 }), 'a', {
      fps: 1,
      character: 5,
    });
    actor.sync({ x: 0, y: 0, facing: 'right', role: 'walk', t: 2 });
    // Character 5 is block column 1, block row 1: sheet row 4 + 2 (right), sheet column 3 + 2.
    expect(numberedCell(sprite.frame, 12)).toBe(600 + 5);
  });

  it("slices the sheet with the card's margin and spacing", async () => {
    const { scene, configs } = fakeScene(new Set(['https://game.test/a.png']));
    await createSpriteActor4(scene, loader({ ...SINGLE, margin_px: 1, spacing_px: 2 }), 'a', { fps: 4 });
    expect(configs).toEqual([{ frameWidth: 48, frameHeight: 48, margin: 1, spacing: 2 }]);
  });

  it('rejects a sheet that is not a 3 x 4 grid, a missing character and a failed load', async () => {
    const { scene } = fakeScene(new Set(['https://game.test/a.png']));
    await expect(
      createSpriteActor4(scene, loader({ frame_w: 48, frame_h: 48, cols: 4, rows: 4 }), 'a', { fps: 4 }),
    ).rejects.toThrow(/3x4/);
    await expect(createSpriteActor4(scene, loader(undefined), 'a', { fps: 4 })).rejects.toThrow(/3x4/);
    await expect(createSpriteActor4(scene, loader(SINGLE), 'a', { fps: 4, character: 1 })).rejects.toThrow(
      /1 characters/,
    );
    await expect(createSpriteActor4(scene, loader(SINGLE), 'a', { fps: 0 })).rejects.toThrow(/fps/);
    const missing = fakeScene(new Set());
    await expect(createSpriteActor4(missing.scene, loader(SINGLE), 'a', { fps: 4 })).rejects.toThrow(/Failed/);
  });
});

describe('facing4', () => {
  it('maps screen velocities (y down) to the four facings', () => {
    expect(facing4(0, 1)).toBe('down');
    expect(facing4(0, -1)).toBe('up');
    expect(facing4(-1, 0)).toBe('left');
    expect(facing4(1, 0)).toBe('right');
    expect(facing4(1, 0.9)).toBe('right');
    expect(facing4(0.9, 1)).toBe('down');
    expect(facing4(0, 0)).toBeUndefined();
    expect(facing4(0, 0, { previous: 'left', degrees: 10 })).toBe('left');
  });

  it('keeps the previous facing while a diagonal walk wobbles on the sector edge', () => {
    const heading = (deg: number): [number, number] => [
      Math.cos((deg * Math.PI) / 180),
      Math.sin((deg * Math.PI) / 180),
    ];
    let facing: Direction4 = 'right';
    const seen = new Set<Direction4>();
    for (const deg of [44, 46, 44, 47, 43, 46]) {
      facing = facing4(...heading(deg), { previous: facing, degrees: 5 })!;
      seen.add(facing);
    }
    expect([...seen]).toEqual(['right']);
    expect(facing4(...heading(60), { previous: 'right', degrees: 5 })).toBe('down');
  });
});
