import type { AssetManifest } from '@ogm/contracts/assets';
import { describe, expect, it } from 'vitest';

import { lockedScale, palette, scaleOf } from '../src/index.js';

const entry = (pack: string, path: string) => ({
  file: { '*': 'x.png' },
  source: { pack, version: '1.3', path },
  license: { id: 'LicenseRef-x', use: 'personal' as const },
});

describe('one scale per game', () => {
  const lock = (paths: string[]) => ({
    assets: paths.map((path, i) => ({ id: `t1:limezu-modern-farm/a${i}@1.3`, path })),
  });

  it('returns the gm.lock.json scale when every set asset is drawn at it', () => {
    expect(lockedScale({ scale: 32 }, lock(['assets/sprite/32x32/Single_Files_32x32/Barrel_32x32.png']))).toBe(32);
  });

  it('rejects a lock mixing two scales', () => {
    expect(() =>
      lockedScale(
        { scale: 16 },
        lock(['assets/sprite/Autotiles_GameMaker_16x16.png', 'assets/sprite/Autotiles_GameMaker_48x48.png']),
      ),
    ).toThrow(/one scale per game \(16 px\).*a1@1\.3/);
  });

  it('rejects a missing or unknown scale', () => {
    expect(() => lockedScale({})).toThrow(/scale must be one of 16, 32, 48/);
    expect(() => lockedScale({ scale: 24 })).toThrow(/got 24/);
  });

  it('ignores icons (their own 16/24/32 sizes) and assets of other sets', () => {
    expect(
      lockedScale(
        { scale: 16 },
        {
          assets: [
            { id: 't1:limezu-modern-farm/icon@1.3', path: 'assets/ui/Icons/Icons_32x32/Apple.png' },
            { id: 't1:kenney-tiny-town/tile@1.0', path: 'assets/sprite/tile_32x32.png' },
          ],
        },
      ),
    ).toBe(16);
  });

  it('rejects a mixed lock in the shape gm assets use writes (slug ids, basename paths)', () => {
    const real = (slug: string, file: string) => ({
      id: `t1:limezu-modern-farm/${slug}@1.3`,
      path: `assets/sprite/limezu-modern-farm/${file}`,
    });
    const assets = [
      real('16x16-animals-16x16-cats-cat-hugo', 'Cat_Hugo.png'),
      real('48x48-animals-48x48-cats-48x48-cat-hugo-48x48', 'Cat_Hugo_48x48.png'),
      real('icons-icons-32x32-singles-icons-32x32-crops-lettuce', 'Singles_Icons_32x32_Crops_Lettuce.png'),
    ];
    expect(() => lockedScale({ scale: 16 }, { assets })).toThrow(/cat-hugo-48x48@1\.3$/);
    expect(lockedScale({ scale: 16 }, { assets: [assets[0]!, assets[2]!] })).toBe(16);
    expect(() => lockedScale({ scale: 48 }, { assets: [assets[0]!] })).toThrow(/cats-cat-hugo@1\.3/);
  });

  it('reads the scale from a folder or a file-name suffix', () => {
    expect(scaleOf('48x48/Animals_48x48/Cats_48x48/Cat.png')).toBe(48);
    expect(scaleOf('Barrel_16x16.png')).toBe(16);
    expect(scaleOf('Icons/Icons_16x16/Apple.png')).toBeUndefined();
    expect(scaleOf('16x32/odd.png')).toBeUndefined();
  });
});

describe('palette', () => {
  it('groups placeable assets of the game scale by pack folder', () => {
    const manifest = {
      version: 1,
      assets: {
        barrel: entry('limezu-modern-farm', '16x16/Single_Files_16x16/Barrel_16x16.png'),
        cow: entry('limezu-modern-farm', '16x16/Animals_16x16/Cows/Cow_16x16.png'),
        corn: entry('limezu-modern-farm', '16x16/Crops_Growth_16x16/Corn_Growth_Stages_16x16.png'),
        tractor: entry('limezu-modern-farm', '16x16/Vehicles_16x16/Tractor_16x16.png'),
        big: entry('limezu-modern-farm', '48x48/Single_Files_48x48/Barrel_48x48.png'),
        tiles: entry('limezu-modern-farm', '16x16/Autotiles_16x16/Autotiles_Godot_16x16.png'),
        other: entry('kenney-tiny-town', '16x16/Single_Files_16x16/Rock.png'),
      },
    } as unknown as AssetManifest;
    expect(palette(manifest, 16)).toEqual({ prop: ['barrel'], animal: ['cow'], crop: ['corn'], vehicle: ['tractor'] });
  });
});
