import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  assetManifestSchema,
  cachePlanSchema,
  type AssetManifest,
  type CachePlan,
  type LoadPhase,
  type Tier,
} from '@ogm/contracts';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { gm, tempDir } from './helpers.js';

const ffmpegAvailable = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function wav(frequency = 440): Buffer {
  const sampleRate = 8_000;
  const samples = 800;
  const dataBytes = samples * 2;
  const bytes = Buffer.alloc(44 + dataBytes);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + dataBytes, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < samples; index += 1) {
    bytes.writeInt16LE(Math.round(Math.sin((index / sampleRate) * Math.PI * frequency * 2) * 8_000), 44 + index * 2);
  }
  return bytes;
}

async function game(includeAudio = false): Promise<string> {
  const cwd = tempDir('gm-content-addressed-');
  const sprite = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#c45' } })
    .png()
    .toBuffer();
  mkdirSync(join(cwd, 'assets/sprite'), { recursive: true });
  writeFileSync(join(cwd, 'assets/sprite/hero.png'), sprite);
  const audioAssets = [];
  if (includeAudio) {
    const music = wav();
    const voice = wav(220);
    mkdirSync(join(cwd, 'assets/music'), { recursive: true });
    mkdirSync(join(cwd, 'assets/voice'), { recursive: true });
    writeFileSync(join(cwd, 'assets/music/theme.wav'), music);
    writeFileSync(join(cwd, 'assets/voice/intro.wav'), voice);
    audioAssets.push(
      {
        id: 't3:fixture/music/theme',
        sha256: sha256(music),
        path: 'assets/music/theme.wav',
        license: 'CC0-1.0',
        rights: { uses: ['in-game'], audience: 'public', redistribution: 'free', attribution: null },
        credit: {
          pack: 'fixture',
          title: 'Fixture assets',
          licenseSource: 'Fixture CC0 declaration',
          attribution: 'none required',
          source: { label: 'test fixture' },
        },
        added: '2026-11-02',
      },
      {
        id: 't3:fixture/voice/intro',
        sha256: sha256(voice),
        path: 'assets/voice/intro.wav',
        license: 'CC0-1.0',
        rights: { uses: ['in-game'], audience: 'public', redistribution: 'free', attribution: null },
        credit: {
          pack: 'fixture',
          title: 'Fixture assets',
          licenseSource: 'Fixture CC0 declaration',
          attribution: 'none required',
          source: { label: 'test fixture' },
        },
        added: '2026-11-02',
      },
    );
  }
  writeFileSync(
    join(cwd, 'assets.lock.json'),
    `${JSON.stringify(
      {
        version: 1,
        family: 'pixel-art',
        pov: 'topdown',
        assets: [
          ...audioAssets,
          {
            id: 't3:fixture/sprite/hero',
            sha256: sha256(sprite),
            path: 'assets/sprite/hero.png',
            license: 'CC0-1.0',
            rights: { uses: ['in-game'], audience: 'public', redistribution: 'free', attribution: null },
            credit: {
              pack: 'fixture',
              title: 'Fixture assets',
              licenseSource: 'Fixture CC0 declaration',
              attribution: 'none required',
              source: { label: 'test fixture' },
            },
            meta: {
              sprite: {
                drawn_view: 'topdown',
                animations: [
                  {
                    name: 'idle',
                    frames: [0],
                    sheets: [{ path: 'hero.png', frame_w: 8, frame_h: 8, cols: 1, rows: 1 }],
                  },
                ],
              },
            },
            added: '2026-11-02',
          },
        ].sort((left, right) => left.id.localeCompare(right.id)),
      },
      null,
      2,
    )}\n`,
  );
  return cwd;
}

function manifest(cwd: string): AssetManifest {
  return assetManifestSchema.parse(JSON.parse(readFileSync(join(cwd, 'public/assets/manifest.json'), 'utf8')));
}

function plan(cwd: string): CachePlan {
  return cachePlanSchema.parse(JSON.parse(readFileSync(join(cwd, 'public/assets/cache-plan.json'), 'utf8')));
}

function expectContentAddresses(cwd: string, assetManifest: AssetManifest, cachePlan: CachePlan): void {
  const urls = Object.keys(assetManifest.files).sort();
  expect(cachePlan.entries.map((entry) => entry.url).sort()).toEqual(urls);
  for (const entry of cachePlan.entries) {
    const bytes = readFileSync(join(cwd, 'public', entry.url.slice(1)));
    expect(entry.url).toMatch(/^\/a\/[0-9a-f]{64}\.(glb|mp3|webp|ttf|otf|woff|woff2)$/);
    expect(basename(entry.url).split('.')[0]).toBe(sha256(bytes));
    expect(entry.sha256).toBe(sha256(bytes));
    expect(entry.bytes).toBe(bytes.length);
  }
  for (const tier of cachePlan.tiers) {
    for (const phase of ['boot', 'ready', 'stream'] satisfies LoadPhase[]) {
      const entries = cachePlan.entries.filter(
        (entry) => entry.phase === phase && (entry.tiers.includes('*') || entry.tiers.includes(tier)),
      );
      expect(cachePlan.totals[tier as Tier][phase]).toEqual({
        bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
        files: entries.length,
      });
    }
  }
}

describe('gm build assets content addresses', () => {
  it('always checks shared sprite addresses and cache-plan totals without ffmpeg', async () => {
    const first = await game();
    const second = await game();
    expect((await gm(['build', 'assets', '--no-cache'], { cwd: first, env: {} })).code).toBe(0);
    expect((await gm(['build', 'assets', '--no-cache'], { cwd: second, env: {} })).code).toBe(0);

    const firstManifest = manifest(first);
    const secondManifest = manifest(second);
    expect(Object.keys(firstManifest.files).sort()).toEqual(Object.keys(secondManifest.files).sort());
    expect(Object.keys(firstManifest.files)).toHaveLength(1);

    const cachePlan = plan(first);
    expect(cachePlan).toMatchObject({ gameId: '', buildId: '', sdkVersion: '' });
    expect(cachePlan.lineage).toBeUndefined();
    expect(cachePlan.entries.map(({ kind, phase }) => ({ kind, phase }))).toEqual([{ kind: 'sprite', phase: 'ready' }]);
    expectContentAddresses(first, firstManifest, cachePlan);
  });

  it.skipIf(!ffmpegAvailable)(
    'writes shared MP3 bytes once-addressed and streams music and voice (skipped without ffmpeg)',
    async () => {
      const first = await game(true);
      const second = await game(true);
      const firstBuild = await gm(['build', 'assets', '--no-cache'], { cwd: first, env: {} });
      const secondBuild = await gm(['build', 'assets', '--no-cache'], { cwd: second, env: {} });
      expect(firstBuild, JSON.stringify(firstBuild)).toMatchObject({ code: 0, err: [] });
      expect(secondBuild, JSON.stringify(secondBuild)).toMatchObject({ code: 0, err: [] });

      const firstManifest = manifest(first);
      const secondManifest = manifest(second);
      const urls = Object.keys(firstManifest.files).sort();
      expect(urls).toEqual(Object.keys(secondManifest.files).sort());
      expect(urls).toHaveLength(3);
      expect(urls.filter((url) => url.endsWith('.mp3'))).toHaveLength(2);

      const cachePlan = plan(first);
      expect(
        cachePlan.entries
          .map(({ kind, phase }) => ({ kind, phase }))
          .sort((left, right) => left.kind.localeCompare(right.kind)),
      ).toEqual([
        { kind: 'music', phase: 'stream' },
        { kind: 'sprite', phase: 'ready' },
        { kind: 'voice', phase: 'stream' },
      ]);
      expectContentAddresses(first, firstManifest, cachePlan);
    },
    60_000,
  );
});
