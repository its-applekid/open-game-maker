import type { AssetManifest } from '@ogm/contracts/assets';

import { conventions, isScale, type Scale } from './conventions.js';

const SET_PACKS: readonly string[] = conventions.packs.value;

/** Icons come in 16, 24 and 32 px whatever the map scale (`Icons_32x32/Singles_Icons_32x32_Crops_Lettuce.png`). */
const ICONS = /(?:^|[/_-])icons(?:[_/-])/i;

/**
 * The scale an asset came from, read from a pack path (`16x16/…`, `…_32x32.png`) or a lock id slug
 * (`…/16x16-single-files-16x16-barrel-16x16@1.3`); icons and battlers have none.
 */
export function scaleOf(path: string): Scale | undefined {
  if (ICONS.test(path)) return undefined;
  const match = /(?:^|[/_-])(16|32|48)x(16|32|48)(?=[/_.@-]|$)/.exec(path);
  if (!match || match[1] !== match[2]) return undefined;
  return Number(match[1]) as Scale;
}

function packOf(id: string): string | undefined {
  return /^t[12]:([a-z0-9-]+)\//.exec(id)?.[1];
}

/**
 * The game's one scale: `gm.lock.json`'s `scale`, checked against every asset of this set in `assets.lock.json`.
 * Throws when the scale is missing or not 16/32/48, or when a locked asset comes from another scale's folder.
 */
export function lockedScale(
  gmLock: { scale?: unknown },
  assetsLock?: { assets: readonly { id: string; path: string }[] },
): Scale {
  const { scale } = gmLock;
  if (!isScale(scale)) {
    throw new Error(`gm.lock.json scale must be one of ${conventions.scales.value.join(', ')}; got ${String(scale)}`);
  }
  const mixed = (assetsLock?.assets ?? []).filter((asset) => {
    const pack = packOf(asset.id);
    if (!pack || !SET_PACKS.includes(pack)) return false;
    if (ICONS.test(asset.path) || ICONS.test(asset.id)) return false;
    const at = scaleOf(asset.path) ?? scaleOf(asset.id);
    return at !== undefined && at !== scale;
  });
  if (mixed.length > 0) {
    throw new Error(
      `one scale per game (${scale} px); these assets are another scale: ${mixed.map((a) => a.id).join(', ')}`,
    );
  }
  return scale;
}

export const PALETTE_GROUPS = {
  prop: 'Single_Files',
  animal: 'Animals',
  crop: 'Crops_Growth',
  vehicle: 'Vehicles',
} as const;
export type PaletteGroup = keyof typeof PALETTE_GROUPS;

/** Asset ids the editor may place, grouped by the pack folder they came from, at the game's scale only. */
export function palette(manifest: AssetManifest, scale: Scale): Record<PaletteGroup, string[]> {
  const groups: Record<PaletteGroup, string[]> = { prop: [], animal: [], crop: [], vehicle: [] };
  for (const [id, entry] of Object.entries(manifest.assets)) {
    const source = entry.source;
    if (!source || !SET_PACKS.includes(source.pack)) continue;
    for (const [group, folder] of Object.entries(PALETTE_GROUPS) as [PaletteGroup, string][]) {
      if (new RegExp(`(?:^|/)${folder}_${scale}x${scale}/`).test(source.path)) groups[group].push(id);
    }
  }
  for (const ids of Object.values(groups)) ids.sort();
  return groups;
}
