import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DesignDocSchema, gameManifestSchema } from '@ogm/contracts';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DEFAULT_DESIGN } from '../src/game.js';
import { manifest } from '../src/manifest.js';

/* The publisher copies a build dir into the games host and the API parses these two files with these schemas. */
const root = fileURLToPath(new URL('..', import.meta.url));
let outDir: string;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'gm-game-3d-build-'));
  await build({ root, logLevel: 'silent', build: { outDir, emptyOutDir: true } });
}, 300_000);

afterAll(() => rmSync(outDir, { recursive: true, force: true }));

const readJson = (path: string): unknown => JSON.parse(readFileSync(join(outDir, path), 'utf8'));

describe('the build writes the files a published build needs', () => {
  it('dist/manifest.json is the game manifest', () => {
    expect(gameManifestSchema.parse(readJson('manifest.json'))).toEqual(manifest);
  });

  it('dist/design/design.json is the folded template design', () => {
    expect(DesignDocSchema.parse(readJson('design/design.json'))).toEqual(DEFAULT_DESIGN);
  });
});
