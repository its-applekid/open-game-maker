import type { AssetLoader } from '@gm/sdk/assets';

type Manifest = Awaited<ReturnType<AssetLoader['load']>>;

export interface PaletteEntry {
  id: string;
  piece: string;
  gridM: number;
}

/** What an editor may place: every manifest entry with a kit block, by piece then id. */
export function kitPalette(manifest: Manifest): PaletteEntry[] {
  return Object.entries(manifest.assets)
    .flatMap(([id, entry]) =>
      entry.meta?.kit ? [{ id, piece: entry.meta.kit.piece, gridM: entry.meta.kit.grid_m }] : [],
    )
    .sort((a, b) => a.piece.localeCompare(b.piece) || a.id.localeCompare(b.id));
}
