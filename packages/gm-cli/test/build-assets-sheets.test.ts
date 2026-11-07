import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { assetManifestSchema, cachePlanSchema, type AssetMetadata, type AssetsLock } from '@ogm/contracts';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { resolveSheetSources, rewriteSpriteSheets, spriteSheetPaths } from '../src/commands/build/assets/sheets.js';
import { gm, library, tempDir } from './helpers.js';

const HERO = 't1:kenney-mini-dungeon/character-hero@2.0';
const EXTRACTED = 'packs/kenney-mini-dungeon/2.0/extracted';
const WALK = 'Spritesheets/With shadows/Walk.png';
const WALK_SHADOWLESS = 'Spritesheets/Shadowless/Walk_Shadowless.png';
const IDLE = 'Spritesheets/With shadows/Idle.png';

const HERO_META = {
  sprite: {
    drawn_view: 'iso',
    animations: [
      {
        name: 'walk',
        frames: [0, 1],
        fps: 12,
        sheets: [
          { path: WALK, variant: 'shadow', frame_w: 8, frame_h: 8, cols: 2, rows: 1 },
          { path: WALK_SHADOWLESS, variant: 'shadowless', frame_w: 8, frame_h: 8, cols: 2, rows: 1 },
        ],
      },
      {
        name: 'idle',
        frames: [0, 1],
        fps: 12,
        sheets: [{ path: IDLE, variant: 'shadow', frame_w: 8, frame_h: 8, cols: 2, rows: 1 }],
      },
    ],
  },
} satisfies AssetMetadata;

async function sheet(red: number): Promise<Buffer> {
  return sharp({ create: { width: 16, height: 8, channels: 4, background: { r: red, g: 40, b: 90, alpha: 1 } } })
    .png()
    .toBuffer();
}

function write(root: string, relative: string, bytes: Buffer): void {
  const file = join(root, relative);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, bytes);
}

/** A library whose hero card lists one primary sheet and two companions, like a SmallScaleInt character. */
async function multiSheetLibrary(): Promise<string> {
  const root = library();
  const sheets = [
    [WALK, await sheet(200)],
    [WALK_SHADOWLESS, await sheet(120)],
    [IDLE, await sheet(60)],
  ] as const;
  for (const [relative, bytes] of sheets) write(root, join(EXTRACTED, relative), bytes);
  writeFileSync(
    join(root, 'packs/kenney-mini-dungeon/cards/character-hero.card.json'),
    `${JSON.stringify(
      {
        schema: 'ogm.asset-card/1.1',
        vocab: '2026-10-26',
        id: HERO,
        card_type: 'asset',
        status: 'measured',
        title: 'Character hero',
        kind: 'sprite',
        subkind: 'character',
        collection: 't1:kenney-mini-dungeon@2.0',
        source: {
          files: [
            {
              path: WALK,
              sha256: `sha256:${'a'.repeat(64)}`,
              bytes: 11,
              format: 'png',
              role: 'primary',
            },
            {
              path: WALK_SHADOWLESS,
              sha256: `sha256:${'b'.repeat(64)}`,
              bytes: 11,
              format: 'png',
              role: 'companion',
            },
            { path: IDLE, sha256: `sha256:${'c'.repeat(64)}`, bytes: 11, format: 'png', role: 'companion' },
          ],
          content_hash: `sha256:${'a'.repeat(64)}`,
        },
        image: { width_px: 16, height_px: 8, has_alpha: true, pixel_art: true },
        ...HERO_META,
        provenance: { '*': { by: 'code', tool: 'gm-measure@0.1', at: '2026-11-01T12:00:00Z' } },
      },
      null,
      2,
    )}\n`,
  );
  return root;
}

async function useHero(cwd: string, root: string, ...extra: string[]): Promise<void> {
  const used = await gm(['assets', 'use', HERO, ...extra, '--family', 'chunky-low-poly', '--pov', 'iso'], {
    cwd,
    env: { OGM_ASSETS_ROOT: root },
  });
  expect(used).toEqual({ code: 0, out: [], err: [] });
}

function read(cwd: string, relative: string): string {
  return readFileSync(join(cwd, relative), 'utf8');
}

/** A lock pins each file's sha256, so changing a library sheet means re-pinning it as a re-import would. */
function repin(cwd: string, absolute: string, lockPath: string): void {
  const digest = createHash('sha256').update(readFileSync(absolute)).digest('hex');
  const path = join(cwd, 'assets.lock.json');
  const lock = JSON.parse(readFileSync(path, 'utf8')) as AssetsLock;
  const entry = lock.assets.find((candidate) => candidate.id === HERO)!;
  const file = entry.files?.find((candidate) => candidate.path === lockPath);
  if (!file) throw new Error(`lock has no file ${lockPath}`);
  file.sha256 = digest;
  writeFileSync(path, `${JSON.stringify(lock, null, 2)}\n`);
}

function sheetPaths(meta: AssetMetadata | undefined): string[] {
  return (meta?.sprite?.animations ?? []).flatMap((animation) => (animation.sheets ?? []).map((sheet) => sheet.path));
}

describe('gm build assets on a multi-sheet sprite card', () => {
  it('builds every sheet the card lists and rewrites its meta paths to the generated files', async () => {
    const root = await multiSheetLibrary();
    const cwd = tempDir('gm-build-sheets-');
    await useHero(cwd, root);

    const result = await gm(['build', 'assets', '--no-cache', '--json'], {
      cwd,
      env: { OGM_ASSETS_ROOT: root },
    });
    expect(result, JSON.stringify(result)).toMatchObject({ code: 0, err: [] });

    const manifest = assetManifestSchema.parse(JSON.parse(read(cwd, 'public/assets/manifest.json')));
    const hero = manifest.assets[HERO]!;
    const primary = hero.file['*']!;
    expect(primary).toMatch(/^\/a\/[0-9a-f]{64}\.webp$/);

    /* Every action sheet the card names is a published file, and the primary is one of them. */
    const sheets = sheetPaths(hero.meta);
    expect(sheets).toHaveLength(3);
    expect(sheets[0]).toBe(primary.slice('/a/'.length));
    expect(new Set(sheets).size).toBe(3);
    for (const name of sheets) {
      expect(name).toMatch(/^[0-9a-f]{64}\.webp$/);
      expect(manifest.files[`/a/${name}`]).toBeDefined();
      expect(await sharp(join(cwd, 'public/a', name)).metadata()).toMatchObject({ width: 16, height: 8 });
    }
    /* The card's own sheet order and geometry survive the rewrite. */
    expect(hero.meta?.sprite?.animations?.map((animation) => animation.name)).toEqual(['walk', 'idle']);
    expect(hero.meta?.sprite?.animations?.[0]?.sheets?.[1]?.variant).toBe('shadowless');

    /* The cache plan carries each sheet so a game preloads it with the asset. */
    const plan = cachePlanSchema.parse(JSON.parse(read(cwd, 'public/assets/cache-plan.json')));
    const heroEntries = plan.entries.filter((entry) => entry.ids?.includes(HERO));
    expect(heroEntries.map((entry) => entry.url).sort()).toEqual(sheets.map((name) => `/a/${name}`).sort());
    expect(heroEntries.every((entry) => entry.kind === 'sprite' && entry.phase === 'ready')).toBe(true);
    expect(heroEntries.every((entry) => entry.tiers.includes('*'))).toBe(true);

    /* The lock keeps the source paths: a dev server reads the collection layout, a build reads the manifest. */
    const lock = JSON.parse(read(cwd, 'assets.lock.json')) as AssetsLock;
    const entry = lock.assets.find((candidate) => candidate.id === HERO)!;
    expect(entry.files).toHaveLength(2);
    expect(sheetPaths(entry.meta)).toEqual([WALK, WALK_SHADOWLESS, IDLE]);
  });

  it('publishes the same sheets for a repo copy, resolving each by the basename beside the primary', async () => {
    const root = await multiSheetLibrary();
    const referenced = tempDir('gm-build-sheets-library-');
    const vendored = tempDir('gm-build-sheets-vendored-');
    await useHero(referenced, root);
    await useHero(vendored, root, '--vendor');

    for (const cwd of [referenced, vendored]) {
      const built = await gm(['build', 'assets', '--no-cache'], { cwd, env: { OGM_ASSETS_ROOT: root } });
      expect(built, JSON.stringify(built)).toMatchObject({ code: 0, err: [] });
    }

    expect(read(vendored, 'public/assets/manifest.json')).toBe(read(referenced, 'public/assets/manifest.json'));
    const hero = assetManifestSchema.parse(JSON.parse(read(vendored, 'public/assets/manifest.json'))).assets[HERO]!;
    const sheets = sheetPaths(hero.meta);
    expect(sheets).toHaveLength(3);
    expect(sheets.every((name) => /^[0-9a-f]{64}\.webp$/.test(name))).toBe(true);
  });

  it('rebuilds the card when a companion sheet changes instead of replaying the cached build', async () => {
    const root = await multiSheetLibrary();
    const cwd = tempDir('gm-build-sheets-cache-');
    await useHero(cwd, root);

    const first = await gm(['build', 'assets', '--json'], { cwd, env: { OGM_ASSETS_ROOT: root } });
    expect(first, JSON.stringify(first)).toMatchObject({ code: 0, err: [] });
    const before = sheetPaths(
      assetManifestSchema.parse(JSON.parse(read(cwd, 'public/assets/manifest.json'))).assets[HERO]!.meta,
    );

    write(root, join(EXTRACTED, WALK_SHADOWLESS), await sheet(15));
    repin(cwd, join(root, EXTRACTED, WALK_SHADOWLESS), WALK_SHADOWLESS);
    const second = await gm(['build', 'assets', '--json'], { cwd, env: { OGM_ASSETS_ROOT: root } });
    expect(second, JSON.stringify(second)).toMatchObject({ code: 0, err: [] });
    const after = sheetPaths(
      assetManifestSchema.parse(JSON.parse(read(cwd, 'public/assets/manifest.json'))).assets[HERO]!.meta,
    );

    /* The changed shadowless sheet gets a new name; the untouched sheets keep theirs. */
    expect(after[1]).not.toBe(before[1]);
    expect([after[0], after[2]]).toEqual([before[0], before[2]]);
    expect(manifestFiles(cwd)).toEqual(expect.arrayContaining(after.map((name) => `/a/${name}`)));
  });
});

function manifestFiles(cwd: string): string[] {
  return Object.keys(assetManifestSchema.parse(JSON.parse(read(cwd, 'public/assets/manifest.json'))).files);
}

describe('sprite sheet paths', () => {
  const meta = {
    sprite: {
      drawn_view: 'iso',
      animations: [
        {
          name: 'walk',
          frames: [0],
          sheets: [{ path: 'Walk.png', frame_w: 8, frame_h: 8, cols: 1, rows: 1 }],
          files: ['Walk_0.png'],
          direction_files: { E: ['Walk_E0.png', 'Walk_E1.png'] },
        },
      ],
      facings: { N: 'Walk_N.png' },
    },
  } as AssetMetadata;

  it('collects every path a card writes, wherever it writes it', () => {
    expect(spriteSheetPaths(meta).sort()).toEqual(
      ['Walk.png', 'Walk_0.png', 'Walk_E0.png', 'Walk_E1.png', 'Walk_N.png'].sort(),
    );
    expect(spriteSheetPaths(undefined)).toEqual([]);
  });

  it('resolves a path by its collection spelling and leaves an ambiguous basename alone', () => {
    const sources = [
      { path: 'Spritesheets/With shadows/Walk.png', absolute: '/lib/Walk.png' },
      { path: 'Spritesheets/Shadowless/Walk_Shadowless.png', absolute: '/lib/Walk_Shadowless.png' },
      { path: 'a/Walk_0.png', absolute: '/lib/a-Walk_0.png' },
      { path: 'b/Walk_0.png', absolute: '/lib/b-Walk_0.png' },
    ];
    const resolved = resolveSheetSources(meta, sources);
    expect(resolved.get('Walk.png')?.absolute).toBe('/lib/Walk.png');
    expect(resolved.get('Walk_N.png')).toBeUndefined();
    expect(resolved.get('Walk_0.png')).toBeUndefined();
    expect(resolved.get('Walk_E0.png')).toBeUndefined();
  });

  it('rewrites every place a card writes a sheet path and leaves unmatched ones as they are', () => {
    const generated = new Map([
      ['Walk.png', 'aaa.webp'],
      ['Walk_E0.png', 'bbb.webp'],
      ['Walk_N.png', 'ccc.webp'],
    ]);
    const rewritten = rewriteSpriteSheets(meta, generated)!;
    expect(rewritten.sprite!.animations![0]!.sheets![0]!.path).toBe('aaa.webp');
    expect(rewritten.sprite!.animations![0]!.files).toEqual(['Walk_0.png']);
    expect(rewritten.sprite!.animations![0]!.direction_files).toEqual({ E: ['bbb.webp', 'Walk_E1.png'] });
    expect(rewritten.sprite!.facings).toEqual({ N: 'ccc.webp' });
    /* The card's own metadata is untouched. */
    expect(meta.sprite!.animations![0]!.sheets![0]!.path).toBe('Walk.png');
    expect(rewriteSpriteSheets(meta, new Map())).toBe(meta);
  });
});
