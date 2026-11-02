import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export type CardEngine = 'phaser' | 'three' | 'both';

export type CardTunable = {
  name: string;
  range: [number, number];
  unit: string;
  from: string;
};

export type PatternCard = {
  file: string;
  topic: string;
  aliases: string[];
  engine: CardEngine;
  tunables: CardTunable[];
  license: string;
  source?: string;
  set?: string;
  text: string;
  body: string;
};

function splitTopLevel(value: string, separator = ','): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (quote) {
      if (character === quote && value[index - 1] !== '\\') quote = '';
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '[' || character === '{') depth += 1;
    else if (character === ']' || character === '}') depth -= 1;
    else if (character === separator && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function scalar(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).replace(/\\([\\"'])/g, '$1');
  }
  return trimmed;
}

function stringArray(value: string, file: string, key: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    throw new Error(`${file}: ${key} must be a flow array`);
  }
  const inner = trimmed.slice(1, -1).trim();
  return inner ? splitTopLevel(inner).map(scalar) : [];
}

function flowMap(value: string, file: string): Record<string, string> {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    throw new Error(`${file}: tunable must be a flow map`);
  }
  return Object.fromEntries(
    splitTopLevel(trimmed.slice(1, -1)).map((part) => {
      const separator = part.indexOf(':');
      if (separator < 1) throw new Error(`${file}: malformed tunable field`);
      return [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
    }),
  );
}

function parseTunable(value: string, file: string): CardTunable {
  const fields = flowMap(value, file);
  for (const key of ['name', 'range', 'unit', 'from']) {
    if (!fields[key]) throw new Error(`${file}: tunable missing ${key}`);
  }
  const range = stringArray(fields.range!, file, 'range').map(Number);
  if (range.length !== 2 || range.some((entry) => !Number.isFinite(entry))) {
    throw new Error(`${file}: tunable range must contain two numbers`);
  }
  return {
    name: scalar(fields.name!),
    range: [range[0]!, range[1]!],
    unit: scalar(fields.unit!),
    from: scalar(fields.from!),
  };
}

function frontMatter(
  text: string,
  file: string,
): { fields: Map<string, string>; tunables: CardTunable[]; body: string } {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') throw new Error(`${file}: missing front matter`);
  const end = lines.indexOf('---', 1);
  if (end < 0) throw new Error(`${file}: unterminated front matter`);

  const fields = new Map<string, string>();
  const tunables: CardTunable[] = [];
  let readingTunables = false;
  for (let index = 1; index < end; index += 1) {
    const line = lines[index]!;
    const field = line.match(/^([a-z][a-z0-9-]*):\s*(.*)$/i);
    if (field) {
      fields.set(field[1]!, field[2]!);
      readingTunables = field[1] === 'tunables';
      continue;
    }
    const tunable = readingTunables ? line.match(/^\s+-\s+(.+)$/) : null;
    if (tunable?.[1]) {
      tunables.push(parseTunable(tunable[1]!, file));
    }
  }
  return {
    fields,
    tunables,
    body: lines
      .slice(end + 1)
      .join('\n')
      .replace(/^\n/, ''),
  };
}

export function parseCard(text: string, file = '<card>'): PatternCard {
  const parsed = frontMatter(text, file);
  const required = (key: string): string => {
    const value = parsed.fields.get(key);
    if (!value) throw new Error(`${file}: missing ${key}`);
    return scalar(value);
  };
  const engine = required('engine');
  if (!['phaser', 'three', 'both'].includes(engine)) {
    throw new Error(`${file}: engine must be phaser, three, or both`);
  }
  if (parsed.tunables.length === 0) throw new Error(`${file}: missing tunables`);

  const source = parsed.fields.get('source');
  const set = parsed.fields.get('set');
  return {
    file,
    topic: required('topic'),
    aliases: parsed.fields.has('aliases') ? stringArray(parsed.fields.get('aliases')!, file, 'aliases') : [],
    engine: engine as CardEngine,
    tunables: parsed.tunables,
    license: required('license'),
    ...(source ? { source: scalar(source) } : {}),
    ...(set ? { set: scalar(set) } : {}),
    text,
    body: parsed.body,
  };
}

function markdownFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
  });
}

function cardFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  if (statSync(root).isFile()) return root.endsWith('.md') ? [root] : [];
  if (basename(root) === 'cards' || (basename(root) === 'references' && existsSync(join(root, 'cards')))) {
    return markdownFiles(basename(root) === 'cards' ? root : join(root, 'cards'));
  }
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? cardFiles(join(root, entry.name)) : [],
  );
}

export function indexCards(roots: readonly string[]): PatternCard[] {
  const files = [...new Set(roots.flatMap((root) => cardFiles(resolve(root))))].sort();
  return files.map((file) => parseCard(readFileSync(file, 'utf8'), file));
}

function rank(card: PatternCard, query: string): number {
  if (card.topic.toLowerCase() === query) return 0;
  if (card.aliases.some((alias) => alias.toLowerCase() === query)) return 1;
  if (card.topic.toLowerCase().includes(query)) return 2;
  if (card.aliases.some((alias) => alias.toLowerCase().includes(query))) return 3;
  return Number.POSITIVE_INFINITY;
}

export function matchCards(cards: readonly PatternCard[], topic: string, engine?: CardEngine): PatternCard[] {
  const query = topic.toLowerCase();
  return cards
    .filter((card) => !engine || card.engine === 'both' || card.engine === engine)
    .map((card) => ({ card, rank: rank(card, query) }))
    .filter(({ rank: score }) => Number.isFinite(score))
    .sort((left, right) => left.rank - right.rank || left.card.topic.localeCompare(right.card.topic))
    .map(({ card }) => card);
}
