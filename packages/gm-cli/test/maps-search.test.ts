import { describe, expect, it } from 'vitest';

import { parseQuery } from '../src/maps/specs.js';
import { gm } from './helpers.js';
import { EXAMPLE_SPEC, mapsLibrary } from './library-rights.js';

const CAVE = 'layout:profantasy-cartographers-annual/example-dungeon-01@illustrative#2';
const DRIFTED = 'inspiration/profantasy-cartographers-annual/layouts/drifted.layout.json';

async function search(argv: string[], root = mapsLibrary()) {
  return gm(['maps', 'search', ...argv], { env: { OGM_ASSETS_ROOT: root } });
}

describe('parseQuery', () => {
  it('reads the C3 §10 example query', () => {
    expect(parseQuery(['small crypt 3-5 rooms one loop secret door'])).toEqual({
      sizeWord: 'small',
      types: ['crypt'],
      rooms: [3, 5],
      loops: { min: 1, exact: false },
      secrets: 1,
      words: [],
    });
  });

  it('lets flags override words and keeps unknown words for ranking', () => {
    expect(parseQuery(['two loops pillared'], { rooms: '4', loops: 1, size: 'small', type: 'cave' })).toEqual({
      rooms: [4, 4],
      loops: { min: 1, exact: true },
      size: 'small',
      types: ['cave'],
      words: ['pillared'],
    });
  });
});

describe('gm maps search', () => {
  it('returns the example spec first and hides the copy whose source lacks derive-layout', async () => {
    const result = await search(['small crypt one loop secret door']);
    expect(result.code).toBe(0);
    expect(result.out[0]).toBe(
      `${EXAMPLE_SPEC}  dungeon  7  1  1  medium  hub-and-spoke  private/previews/00/0000000000000000-thumb.webp`,
    );
    expect(result.out.join('\n')).not.toContain('vision-only-maps');
    expect(result.err).toContain('hidden: 1 specs (source lacks derive-layout)');
  });

  it('excludes a 7-room spec with --rooms 3-5', async () => {
    const result = await search(['--rooms', '3-5']);
    expect(result.out.map((line) => line.split('  ')[0])).toEqual([CAVE]);
    expect(result.err).not.toContain('hidden: 1 specs (source lacks derive-layout)');
  });

  it('applies --loops exactly and --size as a hard filter', async () => {
    const root = mapsLibrary();
    expect((await search(['--loops', '2'], root)).out).toEqual([]);
    const small = await search(['--size', 'small'], root);
    expect(small.out.map((line) => line.split('  ')[0])).toEqual([CAVE]);
  });

  it('ranks by a size word without filtering on it', async () => {
    const result = await search(['small']);
    expect(result.out.map((line) => line.split('  ')[0])).toEqual([CAVE, EXAMPLE_SPEC]);
  });

  it('prints no matches and exits 0 for a type nothing has', async () => {
    const result = await search(['--type', 'tavern']);
    expect(result.code).toBe(0);
    expect(result.out).toEqual([]);
    expect(result.err).toContain('no matches');
  });

  it('reports a spec whose computed tags disagree with its graph and never returns it', async () => {
    const result = await search(['--json']);
    expect(result.err).toContainEqual(expect.stringContaining(`invalid: ${DRIFTED}: tags.computed.loop_count is 4`));
    const ids = result.out.map((line) => (JSON.parse(line) as { id: string }).id);
    expect(ids.sort()).toEqual([EXAMPLE_SPEC, CAVE].sort());
  });

  it('with --cards also lists map cards that grant derive-layout, marked card', async () => {
    const result = await search(['crypt', '--cards']);
    expect(result.out).toContain(
      't1:profantasy-cartographers-annual/example-dungeon-01@illustrative  dungeon  -  -  -  -  -  private/previews/00/0000000000000000-thumb.webp  card',
    );
    expect(result.out.join('\n')).not.toContain('t1:vision-only-maps');
  });

  it('refuses an unknown size and a malformed room range', async () => {
    expect((await search(['--size', 'enormous'])).code).toBe(2);
    expect((await search(['--rooms', 'many'])).code).toBe(2);
  });
});
