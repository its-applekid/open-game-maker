import type { AssetLoader } from '@gm/sdk/assets';
import type Phaser from 'phaser';
import { z } from 'zod';

import { DIRECTIONS, conventions, type Direction } from './conventions.js';
import { isRole, loops, vocabulary } from './vocabulary.js';

export type Variant = (typeof conventions.variants.value)[number];

export interface SpriteActorState {
  x: number;
  y: number;
  facing: Direction;
  /** A role (`walk`, `attack.melee.1`) or one of the set's action names (`Idle2`). */
  action: string;
  /** Seconds since the action started. */
  t: number;
}

export interface SpriteActor {
  readonly sprite: Phaser.GameObjects.Sprite;
  /** The Phaser animation key for an action (role or set name) facing one direction. */
  animationKey(action: string, facing: Direction): string;
  sync(state: SpriteActorState): void;
}

const sheetSchema = z.object({
  path: z.string(),
  variant: z.enum(conventions.variants.value).optional(),
  frame_w: z.number().int().positive(),
  frame_h: z.number().int().positive(),
  cols: z.number().int().positive(),
  rows: z.literal(conventions.sheetGrid.value.rows),
});

const spriteSchema = z.object({
  animations: z
    .array(z.object({ name: z.string(), fps: z.number().positive(), sheets: z.array(sheetSchema).optional() }))
    .min(1),
});

interface Action {
  texture: string;
  fps: number;
  /** Frames per direction row. */
  cols: number;
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Waits for this actor's queued sheets only; other files failing in the same batch are not its concern. */
function loadSheets(scene: Phaser.Scene, keys: string[]): Promise<void> {
  if (keys.length === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const failed: string[] = [];
    const onError = (file: { key: string; src?: string }) => {
      if (keys.includes(file.key)) failed.push(`${file.key} (${file.src ?? 'no url'})`);
    };
    scene.load.on('loaderror', onError);
    scene.load.once('complete', () => {
      scene.load.off('loaderror', onError);
      if (failed.length > 0) reject(new Error(`Failed to load sprite sheets: ${failed.join(', ')}`));
      else resolve();
    });
    scene.load.start();
  });
}

/**
 * Binds one SmallScaleInt character: one texture per action sheet of `variant` (or the action's only, untagged
 * sheet), one animation per action and direction. Sheets are fetched beside the asset's file (the layout
 * `gm assets use` copies them into); actions that have only per-frame files are skipped.
 */
export async function createSpriteActor(
  scene: Phaser.Scene,
  loader: AssetLoader,
  id: string,
  options: { variant: Variant },
): Promise<SpriteActor> {
  const resolved = loader.resolve(id);
  const sprite = spriteSchema.safeParse(resolved.meta?.sprite);
  if (!sprite.success) {
    throw new Error(`Asset ${id} has no SmallScaleInt sheet metadata: ${z.prettifyError(sprite.error)}`);
  }

  const actions = new Map<string, Action>();
  const queued: string[] = [];
  for (const animation of sprite.data.animations) {
    const sheets = animation.sheets ?? [];
    const sheet =
      sheets.find((candidate) => candidate.variant === options.variant) ??
      sheets.find((candidate) => candidate.variant === undefined);
    if (!sheet) continue;
    const texture = `${id}:${animation.name}:${options.variant}`;
    actions.set(animation.name.toLowerCase(), { texture, fps: animation.fps, cols: sheet.cols });
    if (!scene.textures.exists(texture)) {
      const url = new URL(basename(sheet.path), resolved.url).toString();
      scene.load.spritesheet(texture, url, { frameWidth: sheet.frame_w, frameHeight: sheet.frame_h });
      queued.push(texture);
    }
  }
  if (actions.size === 0) throw new Error(`Asset ${id} has no ${options.variant} sheets`);
  await loadSheets(scene, queued);

  const lookup = (action: string): Action => {
    const names: readonly string[] = isRole(action) ? vocabulary[action] : [action];
    for (const name of names) {
      const found = actions.get(name.toLowerCase());
      if (found) return found;
    }
    throw new Error(`Asset ${id} has no ${options.variant} sheet for action ${action}`);
  };

  const rowOf = (facing: Direction) => conventions.sheetRowOrder.value.indexOf(facing);
  const animationKey = (action: string, facing: Direction) => `${lookup(action).texture}:${facing}`;

  for (const [name, { texture, fps, cols }] of actions) {
    for (const facing of DIRECTIONS) {
      const key = `${texture}:${facing}`;
      if (scene.anims.exists(key)) continue;
      const start = rowOf(facing) * cols;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(texture, { start, end: start + cols - 1 }),
        frameRate: fps,
        repeat: loops(name) ? -1 : 0,
      });
    }
  }

  const first = actions.values().next().value!;
  const object = scene.add.sprite(0, 0, first.texture, 0);

  return {
    sprite: object,
    animationKey,
    sync({ x, y, facing, action, t }) {
      const { texture, fps, cols } = lookup(action);
      const step = Math.max(0, Math.floor(t * fps));
      const frame = loops(action) ? step % cols : Math.min(step, cols - 1);
      object.setTexture(texture, rowOf(facing) * cols + frame);
      object.setPosition(x, y);
      object.setDepth(y);
    },
  };
}

function angleGap(a: number, b: number): number {
  const gap = Math.abs(a - b) % 360;
  return gap > 180 ? 360 - gap : gap;
}

/**
 * The nearest of the 8 facings for a screen-space velocity (y grows downward). With `hold`, the previous facing
 * is kept until the heading leaves its 45° sector by more than `hold.degrees`, so a heading wobbling on a sector
 * edge does not flip. A zero velocity keeps the previous facing (undefined without one).
 */
export function facing8(
  vx: number,
  vy: number,
  hold?: { previous: Direction; degrees: number },
): Direction | undefined {
  if (vx === 0 && vy === 0) return hold?.previous;
  const heading = (Math.atan2(-vy, vx) * 180) / Math.PI;
  const angles = conventions.angles.value;
  if (hold && angleGap(heading, angles[hold.previous]) <= 22.5 + hold.degrees) return hold.previous;
  return DIRECTIONS.reduce((best, facing) =>
    angleGap(heading, angles[facing]) < angleGap(heading, angles[best]) ? facing : best,
  );
}
