import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { findBlockedThemeWords, validatePatternCard } from '../src/skills/card-format.js';
import { indexCards } from '../src/skills/cards.js';

const SKILLS = fileURLToPath(new URL('../../../skills/', import.meta.url));

describe('pattern card format', () => {
  it('keeps every first-party card themeless, ranged, executable, and 300-800 estimated tokens', () => {
    const cards = indexCards([SKILLS]);

    expect(cards.map(({ topic }) => topic)).toEqual(
      expect.arrayContaining(['deadzone-camera', 'hit-feedback-tiers', 'jump-buffer-coyote', 'one-way-platforms']),
    );
    for (const card of cards) expect(validatePatternCard(card)).toEqual([]);
  });

  it('reports a filled tunable and exposes reusable theme-name checks', () => {
    const file = fileURLToPath(new URL('./fixtures/cards/jump-buffer-coyote.md', import.meta.url));
    const card = {
      ...indexCards([fileURLToPath(new URL('./fixtures/cards/', import.meta.url))]).find(
        ({ topic }) => topic === 'jump-buffer-coyote',
      )!,
      text: readFileSync(file, 'utf8').replace(
        '# Jump buffer and coyote',
        '```ts\nexport const tunables = { jumpBufferMs: 120 };\n```\n\n## Test',
      ),
    };

    expect(validatePatternCard(card)).toContain('jump-buffer-coyote: tunables export has a filled numeric default');
    expect(findBlockedThemeWords(['PlayerController', 'knight-mode', 'bluePickup'])).toEqual(['blue', 'knight']);
  });

  it('rejects a card without an executable TypeScript fence', () => {
    const card = indexCards([SKILLS])[0]!;

    expect(validatePatternCard({ ...card, text: card.text.replace('```ts', '```') })).toContain(
      `${card.topic}: fenced blocks must use ts`,
    );
  });
});
