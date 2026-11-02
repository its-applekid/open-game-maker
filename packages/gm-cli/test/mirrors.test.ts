import { describe, expect, it } from 'vitest';

import { MIRRORS, findMirror } from '../src/packs/mirrors.js';

describe('tier-2 mirror table', () => {
  it('pins the four approved mirror families', () => {
    expect(MIRRORS.map((mirror) => mirror.id)).toEqual(['kaykit', 'lpc', 'game-icons', 'fontsource']);
    for (const mirror of MIRRORS.filter((entry) => entry.kind === 'git')) expect(mirror.pin).toMatch(/^[a-f0-9]{40}$/);
    expect(MIRRORS.find((mirror) => mirror.id === 'fontsource')?.pin).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('resolves a Fontsource family to a safe collection id and scoped package', () => {
    expect(findMirror('fontsource:press-start-2p')).toMatchObject({
      id: 'fontsource-press-start-2p',
      kind: 'npm',
      source: '@fontsource/press-start-2p',
      pin: '5.3.0',
    });
    expect(findMirror('fontsource:../escape')).toBeUndefined();
  });
});
