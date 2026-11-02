import type { PatternCard } from './cards.js';

export const THEME_WORD_BLOCKLIST = Object.freeze([
  'black',
  'blue',
  'brown',
  'castle',
  'coin',
  'cyan',
  'goblin',
  'gray',
  'green',
  'grey',
  'knight',
  'magenta',
  'orange',
  'pink',
  'purple',
  'red',
  'white',
  'yellow',
]);

function words(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function findBlockedThemeWords(values: string | Iterable<string>): string[] {
  const input = typeof values === 'string' ? [values] : [...values];
  const found = new Set(input.flatMap(words).filter((word) => THEME_WORD_BLOCKLIST.includes(word)));
  return [...found].sort();
}

function filledTunable(text: string): boolean {
  const block = text.match(/export const tunables\s*=\s*\{([\s\S]*?)\}/)?.[1];
  if (!block) return true;
  const values = [...block.matchAll(/[a-z][a-z0-9]*\s*:\s*(\/\*.*?\*\/\s*)?(-?\d+(?:\.\d+)?)/gi)];
  return values.length === 0 || values.some((match) => !/pick from/i.test(match[1] ?? '') || Number(match[2]) !== 0);
}

export function validatePatternCard(card: PatternCard): string[] {
  const issues: string[] = [];
  const prefix = `${card.topic}:`;
  const estimatedTokens = card.body.length / 4;
  if (estimatedTokens < 300 || estimatedTokens > 800) {
    issues.push(`${prefix} estimated token count must be 300-800 (got ${Math.round(estimatedTokens)})`);
  }
  for (const tunable of card.tunables) {
    if (tunable.range.length !== 2 || tunable.range[0] >= tunable.range[1]) {
      issues.push(`${prefix} ${tunable.name} range must have increasing bounds`);
    }
  }
  const fenceLanguages = [...card.text.matchAll(/^```([^\s`]*)\s*\n[\s\S]*?^```\s*$/gm)].map((match) => match[1]);
  if (fenceLanguages.length === 0 || fenceLanguages.some((language) => language !== 'ts')) {
    issues.push(`${prefix} fenced blocks must use ts`);
  }
  if (!card.text.includes('## Test')) issues.push(`${prefix} missing ## Test`);
  if (!card.text.includes('## No obvious extras')) issues.push(`${prefix} missing ## No obvious extras`);
  const blocked = findBlockedThemeWords(card.text);
  if (blocked.length > 0) issues.push(`${prefix} contains theme words: ${blocked.join(', ')}`);
  if (filledTunable(card.text)) issues.push(`${prefix} tunables export has a filled numeric default`);
  return issues;
}
