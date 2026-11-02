import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { gm, library } from './helpers.js';

export const ORC = 't1:kenney-mini-dungeon/character-orc@2.0';
export const WALL = 't1:kenney-mini-dungeon/wall@2.0';
export const SYNTY = 't1:synty-polygon-goblin-war-camp/buildings/sm-bld-prop-torch-01@v3';
export const MAP = 't1:profantasy-cartographers-annual/example-dungeon-01@illustrative';

export function preparedLibrary(): string {
  const root = library();
  const files = [
    ['packs/kenney-mini-dungeon/2.0/extracted/Models/GLB format/character-orc.glb', 'orc-bytes'],
    ['packs/kenney-mini-dungeon/2.0/extracted/Models/GLB format/wall.glb', 'wall-bytes'],
    ['packs/kenney-mini-dungeon/2.0/extracted/Models/GLB format/Textures/colormap.png', 'map-bytes'],
    ['packs/synty-polygon-goblin-war-camp/v3/extracted/FBX/Buildings/SM_Bld_Prop_Torch_01.fbx', 'torch-bytes'],
  ] as const;
  for (const [relative, content] of files) {
    const file = join(root, relative);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, content);
  }
  return root;
}

export async function useOrc(cwd: string, root: string) {
  return gm(['assets', 'use', ORC, '--family', 'chunky-low-poly', '--pov', 'iso'], {
    cwd,
    env: { OGM_ASSETS_ROOT: root },
  });
}
