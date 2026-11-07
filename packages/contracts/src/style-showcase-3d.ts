import { z } from 'zod';

import { thumbnailCardIdSchema } from './thumbnail-scene.js';

const showcaseIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const hexColourSchema = z.string().regex(/^#[0-9a-f]{6}$/);
const routePointSchema = z.tuple([z.number().finite(), z.number().finite()]);
const relativeJsonFile = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9._/-]*\.json$/, 'expected a relative .json file');
const mediaFile = (extension: 'gif' | 'mp4' | 'png') =>
  z.string().regex(new RegExp(`^[a-z0-9][a-z0-9._-]*\\.${extension}$`));

export const showcaseTrack3dSchema = z.strictObject({
  mp4: mediaFile('mp4'),
  gif: mediaFile('gif'),
  poster: mediaFile('png'),
});

const showcaseStop3dSchema = z.strictObject({
  id: showcaseIdSchema,
  label: z.string().min(1).optional(),
  start_time: z.number().nonnegative().finite(),
  sheet: relativeJsonFile,
});

/**
 * Authoring input for one continuous 3D set showcase: a hero walks a closed route through a world
 * whose stops are baked glTF scenes, and each stop has a synchronized model sheet.
 *
 * The route reuses the 2D continuous-showcase runner shape, so `continuous.mjs` times and positions
 * the hero unchanged: one point per stop plus the closing return point, and the first point must
 * equal the last. Interval lengths are checked against the declared speed in the schema.
 */
export const setShowcase3dSchema = z
  .strictObject({
    schema: z.literal('ogm.set-showcase-3d/1'),
    set: showcaseIdSchema,
    style_family: showcaseIdSchema.optional(),
    fps: z.number().int().positive().max(60),
    loop_seconds: z.number().positive().max(30),
    layout: z.strictObject({
      viewport: z.tuple([z.literal(1024), z.literal(1024)]),
      background: hexColourSchema,
      camera: z.strictObject({
        fov_deg: z.number().positive().max(90),
        height_m: z.number().positive(),
        distance_m: z.number().positive(),
      }),
    }),
    runner: z.strictObject({
      ref: thumbnailCardIdSchema,
      action: z.literal('walk'),
      clip: showcaseIdSchema.optional(),
      path: z.strictObject({ points: z.array(routePointSchema).min(2) }),
      speed: z.number().positive().finite(),
      scale: z.number().positive().max(1000),
    }),
    world: relativeJsonFile,
    stops: z.array(showcaseStop3dSchema).min(1),
    required_packs: z.array(showcaseIdSchema).optional(),
  })
  .superRefine((sequence, ctx) => {
    const points = sequence.runner.path.points;
    if (points.length !== sequence.stops.length + 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['runner', 'path', 'points'],
        message: 'provide one route point per stop plus the closing return point',
      });
      return;
    }
    if (JSON.stringify(points[0]) !== JSON.stringify(points.at(-1))) {
      ctx.addIssue({
        code: 'custom',
        path: ['runner', 'path', 'points'],
        message: 'the continuous route must end exactly where it starts',
      });
    }
    const ids = new Set<string>();
    for (const [index, stop] of sequence.stops.entries()) {
      if (ids.has(stop.id)) {
        ctx.addIssue({ code: 'custom', path: ['stops', index, 'id'], message: `duplicate stop id: ${stop.id}` });
      }
      ids.add(stop.id);
      if (stop.start_time >= sequence.loop_seconds) {
        ctx.addIssue({
          code: 'custom',
          path: ['stops', index, 'start_time'],
          message: 'stop time must precede the loop duration',
        });
      }
      if (index > 0 && stop.start_time <= sequence.stops[index - 1]!.start_time) {
        ctx.addIssue({
          code: 'custom',
          path: ['stops', index, 'start_time'],
          message: 'stop times must increase',
        });
      }
      if (index === 0 && stop.start_time !== 0) {
        ctx.addIssue({ code: 'custom', path: ['stops', index, 'start_time'], message: 'the first stop starts at 0' });
      }
    }
    for (const [index, stop] of sequence.stops.entries()) {
      const from = points[index]!;
      const to = points[index + 1]!;
      const nextStart =
        index + 1 < sequence.stops.length ? sequence.stops[index + 1]!.start_time : sequence.loop_seconds;
      const seconds = nextStart - stop.start_time;
      if (!(seconds >= 1 / sequence.fps)) {
        ctx.addIssue({
          code: 'custom',
          path: ['stops', index, 'start_time'],
          message: 'each interval must last at least one frame',
        });
        continue;
      }
      const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const deviation = Math.abs(distance / seconds - sequence.runner.speed) / sequence.runner.speed;
      if (deviation > 0.02 + Number.EPSILON) {
        ctx.addIssue({
          code: 'custom',
          path: ['stops', index, 'start_time'],
          message: `interval renders at ${(distance / seconds).toFixed(3)} m/s, more than 2% from ${sequence.runner.speed} m/s`,
        });
      }
    }
  });
export type SetShowcase3d = z.infer<typeof setShowcase3dSchema>;
export type SetShowcase3dStop = z.infer<typeof showcaseStop3dSchema>;

const manifestStopSchema = z.strictObject({
  id: showcaseIdSchema,
  label: z.string().min(1).optional(),
  start_time: z.number().nonnegative().finite(),
  region: z.strictObject({ poster: mediaFile('png') }),
  sheet: z.strictObject({ poster: mediaFile('png') }),
});

/** The baked 3D set-showcase manifest written after both shared tracks encode and probe clean. */
export const setShowcase3dMediaSchema = z.strictObject({
  schema: z.literal('ogm.set-showcase-media/3'),
  set: showcaseIdSchema,
  client_rendering: z.literal(false),
  duration: z.number().positive().finite(),
  video: z.strictObject({
    codec: z.literal('h264'),
    pixel_format: z.literal('yuv420p'),
    faststart: z.literal(true),
  }),
  tracks: z.strictObject({ region: showcaseTrack3dSchema, sheet: showcaseTrack3dSchema }),
  stops: z.array(manifestStopSchema).min(1),
  qa: z.strictObject({
    timeline_fps: z.literal(1),
    timeline: z.array(mediaFile('png')),
  }),
});
export type SetShowcase3dMedia = z.infer<typeof setShowcase3dMediaSchema>;
