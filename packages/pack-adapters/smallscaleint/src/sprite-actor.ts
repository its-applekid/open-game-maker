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

const { cols, rows } = conventions.sheetGrid.value;
const frameSizes = Object.values(conventions.frameSizes.value).map((size) => size.frame);

const sheetSchema = z.object({
  path: z.string(),
  variant: z.enum(conventions.variants.value).optional(),
  frame_w: z.number().refine((w) => frameSizes.includes(w), { message: `frame_w must be one of ${frameSizes}` }),
  frame_h: z.number(),
  cols: z.literal(cols),
  rows: z.literal(rows),
});

const spriteSchema = z.object({
  animations: z
    .array(z.object({ name: z.string(), fps: z.number().positive(), sheets: z.array(sheetSchema).min(1) }))
    .min(1),
});

type Animation = z.infer<typeof spriteSchema>['animations'][number];

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function loadAll(scene: Phaser.Scene): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (file: { key: string; src?: string }) => {
      scene.load.off('complete', onComplete);
      reject(new Error(`Failed to load sprite sheet ${file.key} (${file.src ?? 'no url'})`));
    };
    const onComplete = () => {
      scene.load.off('loaderror', onError);
      resolve();
    };
    scene.load.once('loaderror', onError);
    scene.load.once('complete', onComplete);
    scene.load.start();
  });
}

/**
 * Binds one SmallScaleInt character: one texture per action sheet of `variant`, one animation per action and
 * direction. Sheets are fetched beside the asset's file (the layout `gm assets use` copies them into).
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

  const actions = new Map<string, { texture: string; animation: Animation }>();
  for (const animation of sprite.data.animations) {
    const sheet = animation.sheets.find((candidate) => candidate.variant === options.variant);
    if (!sheet) continue;
    const texture = `${id}:${animation.name}:${options.variant}`;
    actions.set(animation.name.toLowerCase(), { texture, animation });
    if (!scene.textures.exists(texture)) {
      const url = new URL(basename(sheet.path), resolved.url).toString();
      scene.load.spritesheet(texture, url, { frameWidth: sheet.frame_w, frameHeight: sheet.frame_h });
    }
  }
  if (actions.size === 0) throw new Error(`Asset ${id} has no ${options.variant} sheets`);
  await loadAll(scene);

  const lookup = (action: string) => {
    const names: readonly string[] = isRole(action) ? vocabulary[action] : [action];
    for (const name of names) {
      const found = actions.get(name.toLowerCase());
      if (found) return found;
    }
    throw new Error(`Asset ${id} has no ${options.variant} sheet for action ${action}`);
  };

  const rowOf = (facing: Direction) => conventions.sheetRowOrder.value.indexOf(facing);
  const animationKey = (action: string, facing: Direction) => `${lookup(action).texture}:${facing}`;

  for (const [name, { texture, animation }] of actions) {
    for (const facing of DIRECTIONS) {
      const key = `${texture}:${facing}`;
      if (scene.anims.exists(key)) continue;
      const start = rowOf(facing) * cols;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(texture, { start, end: start + cols - 1 }),
        frameRate: animation.fps,
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
      const { texture, animation } = lookup(action);
      const step = Math.max(0, Math.floor(t * animation.fps));
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
