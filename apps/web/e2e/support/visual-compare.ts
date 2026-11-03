import { writeFile } from 'node:fs/promises';

import sharp from 'sharp';

import type { TestInfo } from '@playwright/test';

type Comparison = {
  score: number;
  pair: Buffer;
  diff: Buffer;
};

export const prototypeThresholds = {
  title: 0.25,
  games: 0.21,
  'creation-option': 0.08,
  'creation-talk': 0.14,
  editor: 0.2,
} as const;

export async function compareScreenshots(reference: Buffer, actual: Buffer): Promise<Comparison> {
  const referenceMeta = await sharp(reference).metadata();
  const actualMeta = await sharp(actual).metadata();
  if (
    !referenceMeta.width ||
    !referenceMeta.height ||
    referenceMeta.width !== actualMeta.width ||
    referenceMeta.height !== actualMeta.height
  ) {
    throw new Error('visual comparison screenshots must have the same non-zero dimensions');
  }

  const [referenceSample, actualSample, referencePixels, actualPixels] = await Promise.all([
    sample(reference),
    sample(actual),
    pixels(reference),
    pixels(actual),
  ]);
  let squaredDistance = 0;
  for (let index = 0; index < referenceSample.length; index += 1) {
    const distance = (referenceSample[index]! - actualSample[index]!) / 255;
    squaredDistance += distance * distance;
  }

  const diffPixels = Buffer.alloc(referencePixels.length);
  for (let index = 0; index < referencePixels.length; index += 1) {
    diffPixels[index] = Math.min(255, Math.abs(referencePixels[index]! - actualPixels[index]!) * 3);
  }
  const { width, height } = referenceMeta;
  const [pair, diff] = await Promise.all([
    sharp({ create: { width: width * 2, height, channels: 3, background: '#111' } })
      .composite([
        { input: reference, left: 0, top: 0 },
        { input: actual, left: width, top: 0 },
      ])
      .png()
      .toBuffer(),
    sharp(diffPixels, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer(),
  ]);

  return { score: Math.sqrt(squaredDistance / referenceSample.length), pair, diff };
}

export async function attachComparison(
  testInfo: TestInfo,
  name: string,
  reference: Buffer,
  actual: Buffer,
): Promise<number> {
  const comparison = await compareScreenshots(reference, actual);
  const artifacts = [
    [`${name}-reference`, reference],
    [`${name}-app`, actual],
    [`${name}-pair`, comparison.pair],
    [`${name}-diff`, comparison.diff],
  ] as const;
  await Promise.all(
    artifacts.map(async ([artifactName, body]) => {
      const path = testInfo.outputPath(`${artifactName}.png`);
      await writeFile(path, body);
      await testInfo.attach(artifactName, { path, contentType: 'image/png' });
    }),
  );
  return comparison.score;
}

async function sample(image: Buffer): Promise<Buffer> {
  return sharp(image).resize(160, 100, { fit: 'fill' }).removeAlpha().blur(2).raw().toBuffer();
}

async function pixels(image: Buffer): Promise<Buffer> {
  return sharp(image).removeAlpha().raw().toBuffer();
}
