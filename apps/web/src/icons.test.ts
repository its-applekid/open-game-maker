import { expect, it } from 'vitest';

import { ICONS } from './icons';

it('keeps every icon a Phosphor 256 grid SVG drawn in currentColor', () => {
  for (const [name, svg] of Object.entries(ICONS)) {
    expect(svg, name).toMatch(/^<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">.+<\/svg>$/s);
  }
  expect(Object.keys(ICONS)).toEqual(expect.arrayContaining(['bug', 'close', 'soundOn', 'soundOff']));
});
