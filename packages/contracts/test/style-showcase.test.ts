import { describe, expect, it } from 'vitest';

import {
  legacyStyleShowcaseSequenceSchema,
  smallScaleIntShowcaseV5Schema,
  smallScaleIntShowcaseV6Schema,
  styleShowcaseSchema,
} from '../src/style-showcase.js';

const media = (id: string, kind: 'region' | 'sheet') => ({
  mp4: `${id}.${kind}.720.mp4`,
  gif: `${id}.${kind}.256.gif`,
  poster: `${id}.${kind}.poster.png`,
});

const v5Manifest = () => ({
  schema: 'ogm.smallscaleint-showcase/5',
  version: 5,
  generatedFrom: 'v5/regions',
  stops: Array.from({ length: 8 }, (_, index) => {
    const id = `${index + 1}-scene-${index + 1}`;
    return {
      id,
      label: `Scene ${index + 1}`,
      seconds: 3.75,
      ...(index === 1 ? { startSeconds: 3.75 } : {}),
      story: { summary: 'authoring metadata' },
      region: media(id, 'region'),
      sheet: media(id, 'sheet'),
    };
  }),
  outlineOptions: {
    id: 'outline-options',
    label: 'Outline options',
    seconds: 3.75,
    variants: [{ id: 'none', label: 'None' }],
    sheet: media('outline-options', 'sheet'),
  },
});

const v6Manifest = () => ({
  schema: 'ogm.set-showcase-media/2',
  set: 'smallscaleint',
  duration: 24,
  tracks: {
    region: media('showcase', 'region'),
    sheet: media('showcase', 'sheet'),
  },
  stops: Array.from({ length: 8 }, (_, index) => {
    const id = `${index + 1}-scene-${index + 1}`;
    return {
      id,
      label: `Scene ${index + 1}`,
      start_time: index * 3,
      region: { poster: `${id}.region.poster.png` },
      sheet: { poster: `${id}.sheet.poster.png` },
    };
  }),
  speed: { unit: 'projected-px/s', declared: 120 },
});

describe('style showcase contracts', () => {
  it('accepts legacy sequence stops while ignoring authoring-only fields', () => {
    const parsed = legacyStyleShowcaseSequenceSchema.parse({
      runner: { ref: 'card:runner' },
      stops: [
        {
          tile: 'fantasy',
          sheet: 'fantasy',
          seconds: 7.5,
          tile_sprites: ['card:tree'],
          sheet_sprites: ['card:knight'],
        },
        { tile: 'modern-zombie', sheet: 'modern-zombie', seconds: 4 },
      ],
    });

    expect(parsed).toEqual({
      stops: [
        { tile: 'fantasy', sheet: 'fantasy', seconds: 7.5 },
        { tile: 'modern-zombie', sheet: 'modern-zombie', seconds: 4 },
      ],
    });
  });

  it('accepts v5 scene media and outline options while ignoring generator metadata', () => {
    const input = v5Manifest();
    const parsed = smallScaleIntShowcaseV5Schema.parse(input);

    expect(parsed.stops).toHaveLength(8);
    expect(parsed.stops[0]?.region.mp4).toBe('1-scene-1.region.720.mp4');
    expect(parsed.stops[1]?.startSeconds).toBe(3.75);
    expect(parsed.outlineOptions?.sheet.poster).toBe('outline-options.sheet.poster.png');
  });

  it('accepts v6 shared tracks and ordered per-stop seek times while ignoring QA metadata', () => {
    const parsed = smallScaleIntShowcaseV6Schema.parse(v6Manifest());

    expect(parsed.tracks.region.mp4).toBe('showcase.region.720.mp4');
    expect(parsed.stops).toHaveLength(8);
    expect(parsed.stops[7]?.start_time).toBe(21);
    expect(parsed.stops[0]?.label).toBe('Scene 1');
  });

  it('rejects malformed ids, filenames, durations, duplicate stops, and schema versions', () => {
    expect(
      legacyStyleShowcaseSequenceSchema.safeParse({
        stops: [
          { tile: 'fantasy', sheet: 'fantasy', seconds: 1 },
          { tile: 'fantasy', sheet: 'fantasy', seconds: 1 },
        ],
      }).success,
    ).toBe(false);

    const wrongSchema = { ...v5Manifest(), schema: 'ogm.smallscaleint-showcase/4' };
    const badDuration = v5Manifest();
    badDuration.stops[0] = { ...badDuration.stops[0]!, seconds: 0 };
    const escapingFile = v5Manifest();
    escapingFile.stops[0] = {
      ...escapingFile.stops[0]!,
      region: { ...escapingFile.stops[0]!.region, mp4: '../outside.mp4' },
    };
    const malformedId = v5Manifest();
    malformedId.stops[0] = { ...malformedId.stops[0]!, id: 'Not valid' };
    const duplicateStop = v5Manifest();
    duplicateStop.stops[1] = { ...duplicateStop.stops[0]!, label: 'Duplicate' };

    for (const input of [wrongSchema, badDuration, escapingFile, malformedId, duplicateStop]) {
      expect(smallScaleIntShowcaseV5Schema.safeParse(input).success).toBe(false);
    }

    const duplicateV6 = v6Manifest();
    duplicateV6.stops[1] = { ...duplicateV6.stops[0]!, label: 'Duplicate' };
    const unorderedV6 = v6Manifest();
    unorderedV6.stops[2] = { ...unorderedV6.stops[2]!, start_time: 3 };
    const outsideDurationV6 = v6Manifest();
    outsideDurationV6.stops[7] = { ...outsideDurationV6.stops[7]!, start_time: 24 };
    for (const input of [duplicateV6, unorderedV6, outsideDurationV6]) {
      expect(smallScaleIntShowcaseV6Schema.safeParse(input).success).toBe(false);
    }
  });

  it('validates normalized legacy and v5 showcase responses', () => {
    expect(
      styleShowcaseSchema.safeParse({
        tileVideoUrl: '/api/catalog/legacy.mp4',
        sheetVideoUrl: '/api/catalog/legacy-sheets.mp4',
        stops: [{ id: 'fantasy', label: 'Fantasy', startSeconds: 0, tileFallbackUrl: '/fantasy.gif' }],
      }).success,
    ).toBe(true);
    expect(
      styleShowcaseSchema.safeParse({
        regionVideoUrl: '/api/catalog/showcase.region.mp4',
        sheetVideoUrl: '/api/catalog/showcase.sheet.mp4',
        stops: [
          {
            id: '1-fantasy',
            label: 'Fantasy',
            startSeconds: 0,
            region: { posterUrl: '/1.region.png' },
            sheet: { posterUrl: '/1.sheet.png' },
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      styleShowcaseSchema.safeParse({
        stops: [
          {
            id: '1-fantasy',
            label: 'Fantasy',
            startSeconds: 0,
            region: { videoUrl: '/1.region.mp4', gifUrl: '/1.region.gif', posterUrl: '/1.region.png' },
            sheet: { videoUrl: '/1.sheet.mp4', gifUrl: '/1.sheet.gif', posterUrl: '/1.sheet.png' },
          },
        ],
        outlineOptions: {
          id: 'outline-options',
          label: 'Outline options',
          sheet: { videoUrl: '/outline.mp4', gifUrl: '/outline.gif', posterUrl: '/outline.png' },
        },
      }).success,
    ).toBe(true);
  });
});
