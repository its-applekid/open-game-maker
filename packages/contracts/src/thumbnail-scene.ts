import { z } from 'zod';

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const hexColourSchema = z.string().regex(/^#[0-9a-f]{6}$/);

/** A versioned asset-card id, never a source path or URL. */
export const thumbnailCardIdSchema = z
  .string()
  .regex(/^t[1-3]:[a-z0-9][a-z0-9-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._/-]*)?@[0-9]+(?:\.[0-9]+)*$/)
  .refine(
    (id) =>
      !id
        .split('@', 1)[0]!
        .split('/')
        .some((segment) => segment === '.' || segment === '..'),
    {
      message: 'card id may not contain traversal segments',
    },
  );

const sceneTargetSchema = z.strictObject({
  kind: z.enum(['set', 'pack']),
  id: slugSchema,
  world: slugSchema,
});

const sceneCanvasSchema = z.strictObject({
  width: z.literal(1024),
  height: z.literal(1024),
  background: hexColourSchema,
});

const sceneCameraSchema = z.strictObject({
  projection: z.literal('isometric-2:1'),
  tile_px: z.tuple([z.literal(128), z.literal(64)]),
  origin_px: z.tuple([z.literal(512), z.literal(256)]),
  elevation_px: z.literal(32),
  pixel_snap: z.literal(true),
});

const sceneLightingSchema = z.strictObject({
  mode: z.literal('source-baked'),
  intensity: z.literal(1),
  tint: z.literal('#ffffff'),
});

const scenePositionSchema = z.strictObject({
  grid: z.tuple([z.number(), z.number(), z.number()]),
  offset_px: z.tuple([z.number().int(), z.number().int()]),
  scale: z.number().int().min(1).max(16),
});

const sceneSelectionSchema = z.strictObject({
  action: slugSchema.optional(),
  direction: z.enum(['E', 'N', 'NE', 'NW', 'S', 'SE', 'SW', 'W']).optional(),
  frame: z.number().int().min(0),
  variant: slugSchema.optional(),
});

const scenePlaybackSchema = z.strictObject({
  mode: z.literal('loop'),
  fps: z.number().positive().max(60),
  phase_frames: z.number().int().min(0),
});

export const thumbnailSceneLayerSchema = z.strictObject({
  id: slugSchema,
  kind: z.enum(['ground', 'prop', 'character', 'effect']),
  role: z.enum(['hero', 'enemy', 'companion']).optional(),
  card_id: thumbnailCardIdSchema,
  position: scenePositionSchema,
  selection: sceneSelectionSchema,
  playback: scenePlaybackSchema.optional(),
  z_order: z.number().int(),
});

function projectedAnchor(layer: z.infer<typeof thumbnailSceneLayerSchema>): [number, number] {
  const [gridX, gridY, gridZ] = layer.position.grid;
  const [offsetX, offsetY] = layer.position.offset_px;
  return [512 + (gridX - gridY) * 64 + offsetX, 256 + (gridX + gridY) * 32 - gridZ * 32 + offsetY];
}

/** Deterministic, card-backed input for one square style-picker diorama. */
export const thumbnailSceneSchema = z
  .strictObject({
    schema: z.literal('ogm.thumbnail-scene/1.0'),
    set_id: slugSchema,
    target: sceneTargetSchema,
    canvas: sceneCanvasSchema,
    camera: sceneCameraSchema,
    lighting: sceneLightingSchema,
    duration_ms: z.literal(4000),
    fps: z.literal(24),
    layers: z.array(thumbnailSceneLayerSchema).min(1),
  })
  .superRefine((scene, ctx) => {
    const layerIds = new Set<string>();
    for (const [index, layer] of scene.layers.entries()) {
      if (layerIds.has(layer.id)) {
        ctx.addIssue({ code: 'custom', path: ['layers', index, 'id'], message: `duplicate layer id: ${layer.id}` });
      }
      layerIds.add(layer.id);
      if (layer.kind === 'character' && !layer.role) {
        ctx.addIssue({ code: 'custom', path: ['layers', index, 'role'], message: 'character layers require a role' });
      }
      if (layer.kind !== 'character' && layer.role) {
        ctx.addIssue({
          code: 'custom',
          path: ['layers', index, 'role'],
          message: 'only character layers may have a role',
        });
      }
    }

    const count = (kind: z.infer<typeof thumbnailSceneLayerSchema>['kind']) =>
      scene.layers.filter((layer) => layer.kind === kind).length;
    if (count('ground') !== 1) {
      ctx.addIssue({ code: 'custom', path: ['layers'], message: 'a scene requires exactly one ground layer' });
    }
    if (count('prop') < 3 || count('prop') > 6) {
      ctx.addIssue({ code: 'custom', path: ['layers'], message: 'a scene requires three to six prop layers' });
    }
    if (count('character') < 2 || count('character') > 3) {
      ctx.addIssue({ code: 'custom', path: ['layers'], message: 'a scene requires two to three character layers' });
    }

    const heroes = scene.layers.filter((layer) => layer.role === 'hero');
    if (heroes.length !== 1) {
      ctx.addIssue({ code: 'custom', path: ['layers'], message: 'a scene requires exactly one hero' });
    } else if (projectedAnchor(heroes[0]!).some((value) => value !== 512)) {
      ctx.addIssue({ code: 'custom', path: ['layers'], message: 'the hero anchor must project to the canvas centre' });
    }
    if (!scene.layers.some((layer) => layer.role === 'enemy')) {
      ctx.addIssue({ code: 'custom', path: ['layers'], message: 'a scene requires at least one enemy' });
    }
  });
export type ThumbnailScene = z.infer<typeof thumbnailSceneSchema>;
export type ThumbnailSceneLayer = z.infer<typeof thumbnailSceneLayerSchema>;

export const thumbnailSchemas = {
  'thumbnail-scene.v1': thumbnailSceneSchema,
} satisfies Record<'thumbnail-scene.v1', z.ZodType>;
