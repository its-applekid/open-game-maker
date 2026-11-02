import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { AssetMetadata } from '@ogm/contracts';

import { gm, library } from './helpers.js';

export const ORC = 't1:kenney-mini-dungeon/character-orc@2.0';
export const WALL = 't1:kenney-mini-dungeon/wall@2.0';
export const SYNTY = 't1:synty-polygon-goblin-war-camp/buildings/sm-bld-prop-torch-01@v3';
export const MAP = 't1:profantasy-cartographers-annual/example-dungeon-01@illustrative';
export const SHEET = 't1:kenney-mini-dungeon/character-sheet@2.0';

export const SHEET_META = {
  sprite: {
    drawn_view: 'iso',
    animations: [
      {
        name: 'walk',
        frames: [0, 1],
        directions: ['E', 'N'],
        sheets: [
          {
            path: 'Spritesheets/character-sheet.png',
            variant: 'shadowless',
            frame_w: 8,
            frame_h: 8,
            cols: 2,
            rows: 1,
          },
        ],
      },
    ],
  },
} satisfies AssetMetadata;

export function preparedLibrary(): string {
  const root = library();
  const files = [
    ['packs/kenney-mini-dungeon/2.0/extracted/Models/GLB format/character-orc.glb', 'orc-bytes'],
    ['packs/kenney-mini-dungeon/2.0/extracted/Models/GLB format/wall.glb', 'wall-bytes'],
    ['packs/kenney-mini-dungeon/2.0/extracted/Models/GLB format/Textures/colormap.png', 'map-bytes'],
    ['packs/synty-polygon-goblin-war-camp/v3/extracted/FBX/Buildings/SM_Bld_Prop_Torch_01.fbx', 'torch-bytes'],
    ['packs/kenney-mini-dungeon/2.0/extracted/Spritesheets/character-sheet.png', 'sheet-bytes'],
  ] as const;
  for (const [relative, content] of files) {
    const file = join(root, relative);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, content);
  }
  writeFileSync(
    join(root, 'packs/kenney-mini-dungeon/cards/character-sheet.card.json'),
    `${JSON.stringify(
      {
        schema: 'ogm.asset-card/1.1',
        vocab: '2026-10-26',
        id: SHEET,
        card_type: 'asset',
        status: 'measured',
        title: 'Character sheet',
        kind: 'sprite',
        subkind: 'character',
        collection: 't1:kenney-mini-dungeon@2.0',
        source: {
          files: [
            {
              path: 'Spritesheets/character-sheet.png',
              sha256: `sha256:${'a'.repeat(64)}`,
              bytes: 11,
              format: 'png',
              role: 'primary',
            },
          ],
          content_hash: `sha256:${'a'.repeat(64)}`,
        },
        image: { width_px: 16, height_px: 8, has_alpha: true, pixel_art: true },
        ...SHEET_META,
        provenance: {
          '*': { by: 'code', tool: 'gm-measure@0.1', at: '2026-11-01T12:00:00Z' },
        },
      },
      null,
      2,
    )}\n`,
  );
  return root;
}

export async function useOrc(cwd: string, root: string) {
  return gm(['assets', 'use', ORC, '--family', 'chunky-low-poly', '--pov', 'iso'], {
    cwd,
    env: { OGM_ASSETS_ROOT: root },
  });
}
