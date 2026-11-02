import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fontsourceMap, gameIconsMap, mapEveryFile } from '../src/packs/mappers.js';
import { tempDir } from './helpers.js';

const temporary: string[] = [];

function fresh(): string {
  const path = tempDir('gm-mappers-');
  temporary.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('mirror licence mappers', () => {
  it('attributes game-icons by author and honors explicit CC0 author lines', async () => {
    const root = fresh();
    await mkdir(join(root, 'icons', 'lorc'), { recursive: true });
    await mkdir(join(root, 'icons', 'sbed'), { recursive: true });
    await writeFile(join(root, 'icons', 'lorc', 'sword.svg'), '<svg/>');
    await writeFile(join(root, 'icons', 'sbed', 'shield.svg'), '<svg/>');
    await writeFile(join(root, 'README.md'), '## License\nCC-BY\nsbed: CC0\n');

    await expect(gameIconsMap(root)).resolves.toEqual({
      'icons/lorc/sword.svg': { license: 'CC-BY-3.0', attribution: 'lorc (game-icons.net)' },
      'icons/sbed/shield.svg': { license: 'CC0-1.0', attribution: null },
    });
  });

  it('reads supported Fontsource metadata and drops an unknown licence', async () => {
    const root = fresh();
    await writeFile(join(root, 'metadata.json'), JSON.stringify({ license: 'OFL-1.1' }));
    await expect(fontsourceMap(root)).resolves.toEqual({ license: 'OFL-1.1', attribution: null });
    await writeFile(join(root, 'metadata.json'), JSON.stringify({ license: 'custom' }));
    await expect(fontsourceMap(root)).resolves.toEqual({
      license: null,
      attribution: null,
      dropped: 'unmapped Fontsource license "custom"',
    });
  });

  it('can attach one confirmed licence to every regular file', async () => {
    const root = fresh();
    await mkdir(join(root, 'nested'));
    await writeFile(join(root, 'nested', 'asset.glb'), 'glb');
    await writeFile(join(root, 'LICENSE.txt'), 'CC0');
    await expect(mapEveryFile(root, 'CC0-1.0', 'KayKit')).resolves.toEqual({
      'LICENSE.txt': { license: 'CC0-1.0', attribution: 'KayKit' },
      'nested/asset.glb': { license: 'CC0-1.0', attribution: 'KayKit' },
    });
  });
});
