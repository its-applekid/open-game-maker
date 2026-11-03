import { z } from 'zod';

const showcaseIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const mediaFile = (extension: 'gif' | 'mp4' | 'png') =>
  z.string().regex(new RegExp(`^[a-z0-9][a-z0-9._-]*\\.${extension}$`));

const sourceMediaSchema = z.strictObject({
  mp4: mediaFile('mp4'),
  gif: mediaFile('gif'),
  poster: mediaFile('png'),
});

const legacyStopSchema = z.object({
  tile: showcaseIdSchema,
  sheet: showcaseIdSchema,
  seconds: z.number().positive().finite(),
});

/** Authoring input used by sets that predate the versioned showcase manifest. */
export const legacyStyleShowcaseSequenceSchema = z
  .object({ stops: z.array(legacyStopSchema).min(1) })
  .superRefine(({ stops }, ctx) => {
    const seen = new Set<string>();
    for (const [index, stop] of stops.entries()) {
      if (seen.has(stop.tile)) {
        ctx.addIssue({ code: 'custom', path: ['stops', index, 'tile'], message: `duplicate stop id: ${stop.tile}` });
      }
      seen.add(stop.tile);
    }
  });
export type LegacyStyleShowcaseSequence = z.infer<typeof legacyStyleShowcaseSequenceSchema>;

const v5StopSchema = z.object({
  id: showcaseIdSchema,
  label: z.string().min(1),
  seconds: z.number().positive().finite(),
  startSeconds: z.number().nonnegative().finite().optional(),
  region: sourceMediaSchema,
  sheet: sourceMediaSchema,
});

const v5OutlineOptionsSchema = z.object({
  id: showcaseIdSchema,
  label: z.string().min(1),
  seconds: z.number().positive().finite(),
  sheet: sourceMediaSchema,
});

/** The host-local SmallScaleInt showcase manifest; unrelated authoring metadata is intentionally stripped. */
export const smallScaleIntShowcaseV5Schema = z
  .object({
    schema: z.literal('ogm.smallscaleint-showcase/5'),
    version: z.literal(5).optional(),
    stops: z.array(v5StopSchema).length(8),
    outlineOptions: v5OutlineOptionsSchema,
  })
  .superRefine(({ stops }, ctx) => {
    const seen = new Set<string>();
    for (const [index, stop] of stops.entries()) {
      if (seen.has(stop.id)) {
        ctx.addIssue({ code: 'custom', path: ['stops', index, 'id'], message: `duplicate stop id: ${stop.id}` });
      }
      seen.add(stop.id);
    }
  });
export type SmallScaleIntShowcaseV5 = z.infer<typeof smallScaleIntShowcaseV5Schema>;

export const styleShowcaseMediaSchema = z
  .strictObject({
    videoUrl: z.string().min(1).optional(),
    gifUrl: z.string().min(1).optional(),
    posterUrl: z.string().min(1).optional(),
  })
  .refine((media) => Object.values(media).some(Boolean), { message: 'showcase media needs at least one URL' });
export type StyleShowcaseMedia = z.infer<typeof styleShowcaseMediaSchema>;

export const styleShowcaseStopSchema = z.strictObject({
  id: showcaseIdSchema,
  label: z.string().min(1),
  startSeconds: z.number().nonnegative().finite(),
  tileFallbackUrl: z.string().min(1).optional(),
  sheetFallbackUrl: z.string().min(1).optional(),
  region: styleShowcaseMediaSchema.optional(),
  sheet: styleShowcaseMediaSchema.optional(),
});
export type StyleShowcaseStop = z.infer<typeof styleShowcaseStopSchema>;

export const styleShowcaseSchema = z.strictObject({
  tileVideoUrl: z.string().min(1).optional(),
  sheetVideoUrl: z.string().min(1).optional(),
  stops: z.array(styleShowcaseStopSchema).min(1),
  outlineOptions: z
    .strictObject({
      id: showcaseIdSchema,
      label: z.string().min(1),
      sheet: styleShowcaseMediaSchema,
    })
    .optional(),
});
export type StyleShowcase = z.infer<typeof styleShowcaseSchema>;
