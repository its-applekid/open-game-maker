const ABBREVIATIONS = ['e.g.', 'i.e.', 'Mr.', 'Mrs.', 'Ms.', 'Dr.'];
const PROTECTED_PERIOD = '\u0000';

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
    if (character === '.' || character === '!' || character === '?') {
      flush();
      while (protectedText[index + 1] === ' ') index += 1;
    }
  }

  flush();
  return sentences;
}
