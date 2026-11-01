import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { identify } from '../src/packs/identify.js';
import { tempDir } from './helpers.js';

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('identify', () => {
  it('recognizes Kenney CC0 and groups sibling textures with a model', async () => {
    const root = tempDir('gm-identify-');
    temporary.push(root);
    await mkdir(join(root, 'Models', 'Textures'), { recursive: true });
    await writeFile(join(root, 'License.txt'), 'Kenney assets are licensed CC0 1.0.');
    await writeFile(join(root, 'Models', 'wall.obj'), 'o wall');
    await writeFile(join(root, 'Models', 'Textures', 'colormap.png'), 'pixels');

    const result = await identify(root);
    expect(result.vendor).toBe('kenney');
    expect(result.license).toBe('CC0-1.0');
    expect(result.items).toContainEqual(
      expect.objectContaining({ path: 'Models/wall.obj', kind: 'model', companions: ['Models/Textures/colormap.png'] }),
    );
    expect(result.hashManifest).toContain('Models/wall.obj');
  });

  it('removes executable files and records them without ever opening them', async () => {
    const root = tempDir('gm-identify-exe-');
    temporary.push(root);
    await writeFile(join(root, 'readme.txt'), 'hello');
    await writeFile(join(root, 'run.sh'), '#!/bin/sh\necho unsafe\n');

    const result = await identify(root);
    expect(result.dropped).toEqual(['run.sh']);
    await expect(readFile(join(root, 'run.sh'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
