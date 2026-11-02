import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { indexCards, matchCards, parseCard } from '../src/skills/cards.js';

const FIXTURES = fileURLToPath(new URL('./fixtures/cards/', import.meta.url));

describe('pattern card index', () => {
  it('parses the card contract while tolerating forward-compatible keys', () => {
    const file = fileURLToPath(new URL('./fixtures/cards/jump-buffer-coyote.md', import.meta.url));
    const text = readFileSync(file, 'utf8');

    expect(parseCard(text, file)).toMatchObject({
      file,
      topic: 'jump-buffer-coyote',
      aliases: ['jump', 'coyote', 'buffer'],
      engine: 'phaser',
      set: 'smallscaleint',
      license: 'Apache-2.0',
      tunables: [{ name: 'jumpBufferMs', range: [100, 150], unit: 'ms', from: 'snappy vs forgiving' }],
      text,
    });
  });

  it('ranks exact topics before aliases and filters engine-specific cards', () => {
    const cards = indexCards([FIXTURES]);

    expect(cards.map(({ topic }) => topic)).toContain('nested-pattern');
    expect(matchCards(cards, 'camera').map(({ topic }) => topic)).toEqual(['deadzone-camera']);
    expect(matchCards(cards, 'deadzone-camera', 'three').map(({ topic }) => topic)).toEqual(['deadzone-camera']);
    expect(matchCards(cards, 'jump', 'three')).toEqual([]);
  });

  it('names a malformed card in its parse error', () => {
    const file = fileURLToPath(new URL('./fixtures/cards/invalid.txt', import.meta.url));

    expect(() => parseCard(readFileSync(file, 'utf8'), file)).toThrow(`${file}: missing tunables`);
  });
});
