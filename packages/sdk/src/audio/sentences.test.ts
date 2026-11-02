import { describe, expect, it } from 'vitest';

import { groupSentences, splitSentences } from './sentences.js';

describe('narration sentences', () => {
  it('groups word alignment at punctuation and preserves timing', () => {
    expect(
      groupSentences([
        { text: 'hello', start_ms: 0, end_ms: 250 },
        { text: 'there', start_ms: 250, end_ms: 500 },
        { text: 'little', start_ms: 500, end_ms: 750 },
        { text: 'fox.', start_ms: 750, end_ms: 1_000 },
        { text: 'good', start_ms: 1_000, end_ms: 1_250 },
        { text: 'luck!', start_ms: 1_250, end_ms: 1_500 },
      ]),
    ).toEqual([
      { text: 'hello there little fox.', start_ms: 0, end_ms: 1_000 },
      { text: 'good luck!', start_ms: 1_000, end_ms: 1_500 },
    ]);
  });

  it('keeps abbreviations and unfinished trailing text together', () => {
    expect(splitSentences("Dr. Vega agrees. I'll start now")).toEqual(['Dr. Vega agrees.', "I'll start now"]);
  });

  it('keeps aligned abbreviations together and bounds unpunctuated captions', () => {
    const words = [
      'Dr.',
      'Vega',
      'has',
      'one',
      'very',
      'long',
      'line',
      'without',
      'any',
      'natural',
      'sentence',
      'ending',
      'until',
    ];
    expect(
      groupSentences(words.map((text, index) => ({ text, start_ms: index * 250, end_ms: (index + 1) * 250 }))),
    ).toEqual([
      { text: words.slice(0, 12).join(' '), start_ms: 0, end_ms: 3_000 },
      { text: 'until', start_ms: 3_000, end_ms: 3_250 },
    ]);
  });
});
