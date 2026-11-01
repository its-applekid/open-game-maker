import { describe, expect, it } from 'vitest';

import { splitSentences } from '../src/sentences.js';

describe('splitSentences', () => {
  it('splits punctuation and newlines while preserving abbreviations', () => {
    expect(splitSentences('Dr. Vega agrees. Build it!\nReady?')).toEqual(['Dr. Vega agrees.', 'Build it!', 'Ready?']);
  });

  it('keeps an unfinished trailing sentence', () => {
    expect(splitSentences("Sure. I'll start now")).toEqual(['Sure.', "I'll start now"]);
  });
});
