import type { AssetLoader } from '@gm/sdk/assets';
import type Phaser from 'phaser';
import { z } from 'zod';

import { DIRECTIONS4, conventions, type Direction4 } from './conventions.js';
import { mvFrame, type Role4 } from './vocabulary.js';

const mv = conventions.rpgMakerMv.value;

export interface SpriteActor4State {
  x: number;
  /** The feet: the sprite's bottom edge, which is also its depth. */
  y: number;
  facing: Direction4;
  role: Role4;
  /** Seconds since the role started. */
  t: number;
}

export interface SpriteActor4 {
  readonly sprite: Phaser.GameObjects.Sprite;
  sync(state: SpriteActor4State): void;
}

const sheetSchema = z.object({
  frame_w: z.number().int().positive(),
  frame_h: z.number().int().positive(),
  cols: z.number().int().multipleOf(mv.cols),
  rows: z.number().int().multipleOf(mv.rows),
});

function loadSheet(scene: Phaser.Scene, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let failed = false;
    const onError = (file: { key: string }) => {
      if (file.key === key) failed = true;
    };
    scene.load.on('loaderror', onError);
    scene.load.once('complete', () => {
      scene.load.off('loaderror', onError);
      if (failed) reject(new Error(`Failed to load sprite sheet ${key}`));
      else resolve();
    });
    scene.load.start();
  });
}

/**
 * Binds an RPG Maker MV character sheet (3 x 4 frames, rows down/left/right/up). Sheets holding several characters
 * (`cols` and `rows` multiples of 3 and 4) take `character`, counted row-major in 3 x 4 blocks.
 * `fps` is the game's choice: the sheet carries no timing.
 */
export async function createSpriteActor4(
  scene: Phaser.Scene,
  loader: AssetLoader,
  id: string,
  options: { fps: number; character?: number },
): Promise<SpriteActor4> {
  if (!(options.fps > 0)) throw new RangeError(`fps must be positive, got ${options.fps}`);
  const resolved = loader.resolve(id);
  const parsed = sheetSchema.safeParse(resolved.meta?.sprite?.sheet);
  if (!parsed.success) throw new Error(`Asset ${id} has no 3x4 sheet geometry: ${z.prettifyError(parsed.error)}`);
  const sheet = parsed.data;
  const blocksAcross = sheet.cols / mv.cols;
  const blocks = blocksAcross * (sheet.rows / mv.rows);
  const character = options.character ?? 0;
  if (!Number.isInteger(character) || character < 0 || character >= blocks) {
    throw new RangeError(`Asset ${id} holds ${blocks} characters; ${character} is out of range`);
  }
  const blockCol = (character % blocksAcross) * mv.cols;
  const blockRow = Math.floor(character / blocksAcross) * mv.rows;

  const texture = `${id}:mv`;
  if (!scene.textures.exists(texture)) {
    scene.load.spritesheet(texture, resolved.url, { frameWidth: sheet.frame_w, frameHeight: sheet.frame_h });
    await loadSheet(scene, texture);
  }

  const frameOf = (role: Role4, facing: Direction4, t: number) => {
    const local = mvFrame(role, facing, Math.floor(Math.max(0, t) * options.fps));
    const row = blockRow + Math.floor(local / mv.cols);
    const col = blockCol + (local % mv.cols);
    return row * sheet.cols + col;
  };

  const object = scene.add.sprite(0, 0, texture, frameOf('idle', 'down', 0));
  object.setOrigin(0.5, 1);
  return {
    sprite: object,
    sync({ x, y, facing, role, t }) {
      object.setFrame(frameOf(role, facing, t));
      object.setPosition(x, y);
      object.setDepth(y);
    },
  };
}

const HEADINGS: Record<Direction4, number> = { right: 0, down: 90, left: 180, up: 270 };

function angleGap(a: number, b: number): number {
  const gap = Math.abs(a - b) % 360;
  return gap > 180 ? 360 - gap : gap;
}

/**
 * The nearest of the 4 facings for a screen velocity (y grows downward). With `hold`, the previous facing is kept
 * until the heading leaves its 90° sector by more than `hold.degrees`, so a diagonal walk does not flicker.
 * A zero velocity keeps the previous facing (undefined without one).
 */
export function facing4(
  vx: number,
  vy: number,
  hold?: { previous: Direction4; degrees: number },
): Direction4 | undefined {
  if (vx === 0 && vy === 0) return hold?.previous;
  const heading = (Math.atan2(vy, vx) * 180) / Math.PI;
  if (hold && angleGap(heading, HEADINGS[hold.previous]) <= 45 + hold.degrees) return hold.previous;
  return DIRECTIONS4.reduce((best, facing) =>
    angleGap(heading, HEADINGS[facing]) < angleGap(heading, HEADINGS[best]) ? facing : best,
  );
}
