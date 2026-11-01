import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { checkSkillDir, checkVendorRoot, type Lib } from './check-api-names.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');
const libRoot = (lib: Lib) => join(here, 'node_modules', lib);

function fixture(name: string, lib: Lib, allow: string[] = []) {
  const result = checkSkillDir(fixtures, lib, libRoot(lib), allow).find((r) => r.skill === name);
  if (!result) throw new Error(`fixture ${name} not found`);
  return result;
}

describe('checkSkillDir', () => {
  it('passes real three.js names', () => {
    const result = fixture('good-three', 'three');
    expect(result.classes).toEqual(
      expect.arrayContaining(['Mesh', 'OrbitControls', 'PerspectiveCamera', 'Scene', 'WebGLRenderer']),
    );
    expect(result.methods).toContain('setAnimationLoop');
    expect(result.missing).toEqual([]);
  });

  it('reports a three.js class that does not exist, with its line', () => {
    expect(fixture('bad-three', 'three').missing).toEqual([
      { name: 'Clockk', kind: 'class', file: 'bad-three.md', line: 7 },
    ]);
  });

  it('passes real Phaser names and methods the same block defines', () => {
    const result = fixture('good-phaser', 'phaser');
    expect(result.methods).toEqual(expect.arrayContaining(['sprite', 'startFollow', 'onHit']));
    expect(result.missing).toEqual([]);
  });

  it('reports a Phaser factory method that does not exist', () => {
    expect(fixture('bad-phaser', 'phaser').missing).toEqual([
      { name: 'spritee', kind: 'method', file: 'bad-phaser.md', line: 8 },
    ]);
  });

  it('suppresses an allowlisted miss, bare or scoped to its skill only', () => {
    expect(fixture('bad-phaser', 'phaser', ['spritee']).missing).toEqual([]);
    expect(fixture('bad-phaser', 'phaser', ['bad-phaser:spritee']).missing).toEqual([]);
    expect(fixture('bad-phaser', 'phaser', ['other-skill:spritee']).missing).toHaveLength(1);
  });
});

describe('vendored tree', () => {
  const summaries = checkVendorRoot(join(here, '../../skills/vendor'));

  it('names only classes and methods that exist in phaser 4.2.1 and three 0.186.1', () => {
    const missing = summaries.flatMap((s) =>
      s.results.flatMap((r) => r.missing.map((m) => `${s.set}/${r.skill}/${m.file}:${m.line} ${m.name}`)),
    );
    expect(missing).toEqual([]);
  });

  it('checks every Phaser and CloudAI skill and the engine-specific gamedev skills', () => {
    const skills = (set: string, library: Lib) => summaries.find((s) => s.set === set && s.library === library)?.skills;
    expect(skills('phaser', 'phaser')).toBe(28);
    expect(skills('threejs', 'three')).toBe(11);
    expect(skills('gamedev', 'phaser')).toBeGreaterThanOrEqual(2);
    expect(skills('gamedev', 'three')).toBeGreaterThanOrEqual(3);
  });
});
