import { extname, dirname, resolve } from 'node:path';

import type { AssetsLock, Tier } from '@ogm/contracts';

import { inspectGltf } from './gltf.js';
import { slugFromId } from './files.js';
import type { BuildFailure, BuildItem, BuildJob } from './types.js';

const MODEL = new Set(['.glb']);
const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const AUDIO = new Set(['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac']);
const FONT = new Set(['.ttf', '.otf', '.woff', '.woff2']);

function recipe(kind: BuildJob['kind'], tiers: Tier[], items: BuildItem[]): Record<string, unknown> {
  return {
    version: 1,
    kind,
    tiers,
    inputs: items.map((item) => ({
      id: item.entry.id,
      license: item.entry.license,
      rights: item.entry.rights,
      ...(item.meta === undefined ? {} : { meta: item.meta }),
    })),
    tools: { gltfTransform: '4.5.1', meshoptimizer: '1.3.0', sharp: '0.35.5', ffmpeg: 'libmp3lame-q4' },
  };
}

export async function planBuild(
  lock: AssetsLock,
  cwd: string,
  tiers: Tier[],
  useCache: boolean,
): Promise<{ jobs: BuildJob[]; failures: BuildFailure[] }> {
  const jobs: BuildJob[] = [];
  const failures: BuildFailure[] = [];
  const modelItems: BuildItem[] = [];

  for (const entry of lock.assets) {
    const source = resolve(cwd, entry.path);
    const extension = extname(entry.path).toLowerCase();
    const meta = entry.meta;
    const item: BuildItem = { entry, source, ...(meta === undefined ? {} : { meta }) };
    if (MODEL.has(extension)) {
      try {
        const inspected = await inspectGltf(source, cwd, useCache);
        modelItems.push({ ...item, facts: inspected.facts, sourceHash: inspected.sourceHash });
      } catch (error) {
        failures.push({ id: entry.id, message: error instanceof Error ? error.message : String(error) });
      }
      continue;
    }
    const kind = IMAGE.has(extension) ? 'image' : AUDIO.has(extension) ? 'audio' : FONT.has(extension) ? 'font' : null;
    if (kind === null) {
      failures.push({ id: entry.id, message: `unsupported asset format ${extension || '(none)'}` });
      continue;
    }
    const pixelArt = kind === 'image' && lock.family === 'pixel-art';
    jobs.push({
      kind,
      slug: slugFromId(entry.id),
      items: [item],
      tiers,
      /* `unscaled` changes the cache key so builds cached while pixel art was still downscaled are not reused. */
      recipe: { ...recipe(kind, tiers, [item]), ...(pixelArt ? { pixel_art: true, unscaled: true } : {}) },
      ...(pixelArt ? { pixelArt } : {}),
    });
  }

  const kitGroups = new Map<string, BuildItem[]>();
  for (const item of modelItems) {
    const meta = item.meta as { kit?: unknown; rig?: unknown } | undefined;
    const facts = item.facts!;
    const declaredKit = meta?.kit !== undefined;
    const eligible =
      declaredKit ||
      (meta?.rig === undefined && !facts.rigged && facts.triangles < 5_000 && facts.textureKeys.length > 0);
    if (!eligible) {
      jobs.push({
        kind: 'model',
        slug: slugFromId(item.entry.id),
        items: [item],
        tiers,
        recipe: recipe('model', tiers, [item]),
      });
      continue;
    }
    const textureKey = declaredKit ? 'declared-kit' : facts.textureKeys.join(',');
    const groupKey = `${dirname(item.entry.path)}\0${textureKey}`;
    const group = kitGroups.get(groupKey) ?? [];
    group.push(item);
    kitGroups.set(groupKey, group);
  }
  for (const items of kitGroups.values()) {
    const sortedItems = [...items].sort((left, right) => left.entry.id.localeCompare(right.entry.id));
    jobs.push({
      kind: 'kit',
      slug: dirname(items[0]!.entry.path).split('/').at(-1) ?? 'kit',
      items: sortedItems,
      tiers,
      recipe: recipe('kit', tiers, sortedItems),
    });
  }

  jobs.sort((left, right) => left.items[0]!.entry.id.localeCompare(right.items[0]!.entry.id));
  return { jobs, failures };
}
