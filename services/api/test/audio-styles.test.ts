import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app/app.js';
import { audioStyleFamilies, audioStyleSample } from '../src/catalog/audio-styles.js';
import { catalogRoutes, prefix } from '../src/catalog/routes.js';
import { asUser, installUsers, makeDeps } from './helpers.js';

const CREATOR = {
  kind: 'user' as const,
  userId: 'u_audio_creator',
  email: 'audio@example.test',
  displayName: 'Audio Creator',
  familyId: null,
  platformRole: 'none' as const,
  capability: 'creator' as const,
};

const SAMPLE = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]);

/** A writable assets root whose audio-styles folder holds the given `<id>.<ext>` montages. */
function library(samples: Record<string, string | Uint8Array>): string {
  const root = mkdtempSync(join(tmpdir(), 'ogm-api-audio-styles-'));
  const folder = join(root, 'audio-styles');
  mkdirSync(folder, { recursive: true });
  for (const [name, contents] of Object.entries(samples)) writeFileSync(join(folder, name), contents);
  return root;
}

function appWith(assetsRoot: string | undefined) {
  const deps = makeDeps();
  installUsers(deps, [CREATOR]);
  const app = createApp(deps);
  app.route(prefix, catalogRoutes({ assetsRoot }));
  return { app, deps };
}

describe('audioStyleFamilies', () => {
  it('offers only the taste-led styles whose montage was rendered, grouped by style axis', async () => {
    const root = library({ 'chiptune-playful.mp3': 'a', 'chiptune-energetic.mp3': 'b', 'ambient-calm.ogg': 'c' });
    const families = await audioStyleFamilies(root, prefix);
    expect(families.map((family) => family.id)).toEqual(['chiptune', 'ambient']);
    expect(families[0]?.styles.map((style) => style.id)).toEqual(['chiptune-playful', 'chiptune-energetic']);
    expect(families[0]?.styles[0]).toMatchObject({
      label: 'Chiptune · Playful',
      style: 'chiptune',
      mood: 'playful',
      sampleUrl: '/api/catalog/audio-styles/chiptune-playful/sample',
    });
    expect(families[1]?.styles[0]?.id).toBe('ambient-calm');
  });

  it('offers nothing when the library is not mounted or a style has no sample', async () => {
    expect(await audioStyleFamilies(undefined, prefix)).toEqual([]);
    expect(await audioStyleFamilies(library({}), prefix)).toEqual([]);
    // A file whose stem is not a contract style is ignored, so a stray file never becomes a tile.
    expect(await audioStyleFamilies(library({ 'not-a-style.mp3': 'x' }), prefix)).toEqual([]);
  });
});

describe('audioStyleSample', () => {
  it('resolves a sample inside the assets root and refuses an unknown style', async () => {
    const root = library({ 'chiptune-playful.mp3': 'abc' });
    const sample = await audioStyleSample(root, 'chiptune-playful');
    expect(sample?.mime).toBe('audio/mpeg');
    expect(sample?.bytes).toBe(3);
    expect(await audioStyleSample(root, 'not-a-style')).toBeUndefined();
    expect(await audioStyleSample(undefined, 'chiptune-playful')).toBeUndefined();
  });
});

describe('GET /api/catalog/audio-styles', () => {
  it('needs no principal and is cached with an ETag', async () => {
    const { app } = appWith(library({ 'chiptune-playful.mp3': 'a' }));
    const response = await app.request('/api/catalog/audio-styles');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    const body = (await response.json()) as { families: Array<{ id: string; styles: unknown[] }> };
    expect(body.families).toHaveLength(1);
    expect(body.families[0]?.styles).toHaveLength(1);
    const etag = response.headers.get('etag');
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    expect(
      (await app.request('/api/catalog/audio-styles', { headers: { 'if-none-match': etag as string } })).status,
    ).toBe(304);
  });

  it('streams a sample to a signed-in creator with range support', async () => {
    const { app } = appWith(library({ 'chiptune-playful.mp3': SAMPLE }));
    const url = '/api/catalog/audio-styles/chiptune-playful/sample';
    const full = await app.request(url, { headers: asUser(CREATOR.userId) });
    expect(full.status).toBe(200);
    expect(full.headers.get('content-type')).toBe('audio/mpeg');
    expect(full.headers.get('accept-ranges')).toBe('bytes');
    const partial = await app.request(url, { headers: { ...asUser(CREATOR.userId), range: 'bytes=2-4' } });
    expect(partial.status).toBe(206);
    expect(partial.headers.get('content-range')).toBe('bytes 2-4/8');
    expect(new Uint8Array(await partial.arrayBuffer())).toEqual(new Uint8Array([0x33, 0x04, 0x00]));
  });

  it('refuses a sample to a caller with no session and a style with no file', async () => {
    const { app } = appWith(library({ 'chiptune-playful.mp3': 'abc' }));
    expect((await app.request('/api/catalog/audio-styles/chiptune-playful/sample')).status).toBe(401);
    const missing = await app.request('/api/catalog/audio-styles/ambient-calm/sample', {
      headers: asUser(CREATOR.userId),
    });
    expect(missing.status).toBe(404);
  });
});
