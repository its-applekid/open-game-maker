export type AlignmentSegment = { text: string; start_ms: number; end_ms: number };
export type TimedSentence = { text: string; start_ms: number; end_ms: number };

const ABBREVIATIONS = ['e.g.', 'i.e.', 'Mr.', 'Mrs.', 'Ms.', 'Dr.'];
const MAX_WORDS_WITHOUT_PUNCTUATION = 12;
const PROTECTED_PERIOD = '\u0000';

export function groupSentences(alignment: readonly AlignmentSegment[]): TimedSentence[] {
  const sentences: TimedSentence[] = [];
  let words: AlignmentSegment[] = [];

  const flush = () => {
    if (words.length === 0) return;
    sentences.push({
      text: words.map(({ text }) => text).join(' '),
      start_ms: words[0]!.start_ms,
      end_ms: words.at(-1)!.end_ms,
    });
    words = [];
  };

  for (const segment of alignment) {
    words.push(segment);
    const endsSentence = /[.!?]$/.test(segment.text) && !ABBREVIATIONS.includes(segment.text);
    if (endsSentence || words.length === MAX_WORDS_WITHOUT_PUNCTUATION) flush();
  }
  flush();
  return sentences;
}

export function splitSentences(text: string): string[] {
  let protectedText = text;
  for (const abbreviation of ABBREVIATIONS) {
    protectedText = protectedText.replaceAll(abbreviation, abbreviation.replaceAll('.', PROTECTED_PERIOD));
  }

  const sentences: string[] = [];
  let current = '';
  const flush = () => {
    const sentence = current.replaceAll(PROTECTED_PERIOD, '.').trim();
    if (sentence) sentences.push(sentence);
    current = '';
  };

  for (let index = 0; index < protectedText.length; index += 1) {
    const character = protectedText[index]!;
    if (character === '\n') {
      flush();
      continue;
    }
    current += character;
    if (/[.!?]/.test(character)) {
      flush();
      while (protectedText[index + 1] === ' ') index += 1;
    }
  }
  flush();
  return sentences;
}
