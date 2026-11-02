import { describe, expect, it } from 'vitest';

import type { AssetsLock } from '@ogm/contracts';

import { renderCredits } from '../src/credits.js';

describe('credits rendering', () => {
  it('groups by licence and deduplicates attribution deterministically', () => {
    const lock: AssetsLock = {
      version: 1,
      family: 'chunky-low-poly',
      pov: 'iso',
      assets: [
        {
          id: 't1:kenney-mini-dungeon/character-orc@2.0',
          sha256: '0'.repeat(64),
          path: 'assets/model/kenney-mini-dungeon/orc.glb',
          license: 'CC0-1.0',
          rights: { uses: ['in-game'], audience: 'public', redistribution: 'free', attribution: null },
          added: '2026-11-01',
        },
        {
          id: 't3:coin-hop/door-a',
          sha256: '1'.repeat(64),
          path: 'assets/model/coin-hop/door-a.glb',
          license: 'LicenseRef-studio',
          rights: { uses: ['in-game'], audience: 'public', redistribution: 'free', attribution: 'Studio A' },
          added: '2026-11-01',
        },
        {
          id: 't3:coin-hop/door-b',
          sha256: '2'.repeat(64),
          path: 'assets/model/coin-hop/door-b.glb',
          license: 'LicenseRef-studio',
          rights: { uses: ['in-game'], audience: 'public', redistribution: 'free', attribution: 'Studio A' },
          added: '2026-11-01',
        },
        {
          id: 't3:coin-hop/spark',
          sha256: '3'.repeat(64),
          path: 'assets/vfx/coin-hop/spark.png',
          license: 'LicenseRef-made-by-agent',
          rights: { uses: ['in-game'], audience: 'public', redistribution: 'free', attribution: null },
          added: '2026-11-01',
        },
      ],
    };

    expect(renderCredits(lock)).toBe(
      '# Credits\n\n## CC0-1.0\n- CC0 assets from: kenney-mini-dungeon\n\n## LicenseRef-made-by-agent\n\n## LicenseRef-studio\n- Studio A\n',
    );
  });
});
