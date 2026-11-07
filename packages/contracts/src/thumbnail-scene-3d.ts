import { z } from 'zod';

import { thumbnailCardIdSchema } from './thumbnail-scene.js';

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const hexColourSchema = z.string().regex(/^#[0-9a-f]{6}$/);
const pointSchema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

const sceneCanvasSchema = z.strictObject({
  width: z.literal(1024),
  height: z.literal(1024),
  background: hexColourSchema,
});

/** A square perspective camera; `orbit_deg` turns the camera that far around the target over one loop. */
const sceneCameraSchema = z.strictObject({
  projection: z.literal('perspective'),
  fov_deg: z.number().positive().max(90),
  position: pointSchema,
  target: pointSchema,
  orbit_deg: z.number().min(0).max(360),
});

const sceneLightingSchema = z.strictObject({
  mode: z.literal('scene'),
  intensity: z.literal(1),
});

/** The neutral ground plane the cards stand on; it is geometry, never a card. */
const sceneGroundSchema = z.strictObject({
  size_m: z.tuple([z.number().positive(), z.number().positive()]),
  position: pointSchema,
  colour: hexColourSchema,
});

export const sceneItemKinds = [
  'prop',
  'character',
  'creature',
  'building',
  'nature',
  'vehicle',
  'weapon',
  'food',
  'effect',
] as const;

const sceneItemSchema = z.strictObject({
  id: slugSchema,
  kind: z.enum(sceneItemKinds),
  role: z.enum(['hero', 'companion', 'enemy', 'prop']).optional(),
  card_id: thumbnailCardIdSchema,
  position: pointSchema,
  rotation_y: z.number().finite(),
  scale: z.number().positive().max(1000),
});

/**
 * Deterministic, card-backed input for one square glTF diorama.
 *
 * A pack scene stands three to six measured model cards on a ground plane and orbits the square
 * 1024 px camera once per loop. A set scene is the same shape for the set's own cards. The scene
 * only names versioned asset-card ids; the renderer resolves each id through the selected library.
 */
export const thumbnailScene3dSchema = z
  .strictObject({
    schema: z.literal('ogm.thumbnail-scene-3d/1.0'),
    set_id: slugSchema,
    target: z.strictObject({
      kind: z.enum(['pack', 'set']),
      id: slugSchema,
    }),
    canvas: sceneCanvasSchema,
    camera: sceneCameraSchema,
    lighting: sceneLightingSchema,
    duration_ms: z.number().int().positive().max(20_000),
    fps: z.number().int().positive().max(60),
    ground: sceneGroundSchema,
    items: z.array(sceneItemSchema).min(1).max(24),
  })
  .superRefine((scene, ctx) => {
    if ((scene.duration_ms * scene.fps) % 1000 !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['duration_ms'],
        message: 'duration must contain a whole number of frames',
      });
    }
    const ids = new Set<string>();
    for (const [index, item] of scene.items.entries()) {
      if (ids.has(item.id)) {
        ctx.addIssue({ code: 'custom', path: ['items', index, 'id'], message: `duplicate item id: ${item.id}` });
      }
      ids.add(item.id);
      if (item.role && item.kind !== 'character') {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'role'],
          message: 'only character items may have a role',
        });
      }
    }
    const cards = scene.items.map((item) => item.card_id);
    if (new Set(cards).size !== cards.length) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'a scene uses each card at most once' });
    }
    if (scene.target.kind === 'pack') {
      if (scene.items.length < 3 || scene.items.length > 6) {
        ctx.addIssue({ code: 'custom', path: ['items'], message: 'a pack scene stands three to six cards' });
      }
      if (scene.items.some((item) => !item.card_id.includes(`:${scene.target.id}/`))) {
        ctx.addIssue({
          code: 'custom',
          path: ['items'],
          message: 'every pack scene card must belong to the target pack',
        });
      }
    }
  });
export type ThumbnailScene3d = z.infer<typeof thumbnailScene3dSchema>;
export type ThumbnailScene3dItem = z.infer<typeof sceneItemSchema>;

const sheetModelSchema = z.strictObject({
  id: slugSchema,
  card_id: thumbnailCardIdSchema,
  position: pointSchema,
  scale: z.number().positive().max(1000),
});

/** One synchronized model sheet: a grid of cards that turns in step with the showcase loop. */
export const thumbnailSheet3dSchema = z
  .strictObject({
    schema: z.literal('ogm.thumbnail-sheet-3d/1.0'),
    background: hexColourSchema,
    grid: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    rotate_deg_per_second: z.number().min(0).max(360),
    ground: sceneGroundSchema,
    camera: z.strictObject({
      fov_deg: z.number().positive().max(90),
      position: pointSchema,
      target: pointSchema,
    }),
    models: z.array(sheetModelSchema).min(1).max(24),
  })
  .superRefine((sheet, ctx) => {
    if (sheet.grid[0] * sheet.grid[1] < sheet.models.length) {
      ctx.addIssue({ code: 'custom', path: ['grid'], message: 'grid must have one cell per model' });
    }
    const ids = new Set<string>();
    for (const [index, model] of sheet.models.entries()) {
      if (ids.has(model.id)) {
        ctx.addIssue({ code: 'custom', path: ['models', index, 'id'], message: `duplicate model id: ${model.id}` });
      }
      ids.add(model.id);
    }
    const cards = sheet.models.map((model) => model.card_id);
    if (new Set(cards).size !== cards.length) {
      ctx.addIssue({ code: 'custom', path: ['models'], message: 'a sheet uses each card at most once' });
    }
  });
export type ThumbnailSheet3d = z.infer<typeof thumbnailSheet3dSchema>;

export const thumbnail3dSchemas = {
  'thumbnail-scene-3d.v1': thumbnailScene3dSchema,
  'thumbnail-sheet-3d.v1': thumbnailSheet3dSchema,
} satisfies Record<string, z.ZodType>;
