// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { foldDesignFiles } from './index.js';

const entity = (id: string) => ({ id, prefab: 'spawn', level: 'main', origin: 'build', props: {} });
const A = 'spawn_01K8ZTEMP00000000000000001';
const B = 'spawn_01K8ZTEMP00000000000000002';

function designDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'gm-design-'));
  for (const [name, doc] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(doc));
  return dir;
}

/* A game may split its design across design/*.json; the published build carries exactly one doc the API can load. */
describe('foldDesignFiles', () => {
  it('folds every design file into one doc', () => {
    const dir = designDir({
      'b.json': { schemaVersion: 1, globals: { speed: 2 }, entities: { [B]: entity(B) } },
      'a.json': { schemaVersion: 1, globals: { width: 10 }, entities: { [A]: entity(A) } },
      'notes.txt': 'ignored',
    });
    expect(foldDesignFiles(dir)).toEqual({
      schemaVersion: 1,
      globals: { width: 10, speed: 2 },
      entities: { [A]: entity(A), [B]: entity(B) },
    });
  });

  it('refuses an entity defined by two files instead of silently keeping one', () => {
    const doc = { schemaVersion: 1, globals: {}, entities: { [A]: entity(A) } };
    expect(() => foldDesignFiles(designDir({ 'a.json': doc, 'b.json': doc }))).toThrow(
      `design/b.json: entity "${A}" is already defined by another design file`,
    );
  });

  it('refuses a design file whose entity ids are not stable ids', () => {
    const dir = designDir({ 'a.json': { schemaVersion: 1, globals: {}, entities: { spawn_a: entity('spawn_a') } } });
    expect(() => foldDesignFiles(dir)).toThrow(/design\/a\.json is not a valid design doc/);
  });

  it('refuses a global defined by two files', () => {
    const doc = { schemaVersion: 1, globals: { speed: 1 }, entities: {} };
    expect(() => foldDesignFiles(designDir({ 'a.json': doc, 'b.json': doc }))).toThrow(
      'design/b.json: global "speed" is already defined by another design file',
    );
  });

  it('names the design file that is not JSON', () => {
    const dir = designDir({});
    writeFileSync(join(dir, 'level.json'), '{ broken');
    expect(() => foldDesignFiles(dir)).toThrow(/^design\/level\.json is not valid JSON/);
  });

  it('refuses files with different schema versions', () => {
    const dir = designDir({
      'a.json': { schemaVersion: 1, globals: {}, entities: {} },
      'b.json': { schemaVersion: 2, globals: {}, entities: {} },
    });
    expect(() => foldDesignFiles(dir)).toThrow('design/b.json: schemaVersion 2 differs from 1');
  });
});
