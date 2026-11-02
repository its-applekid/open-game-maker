import { createHash } from 'node:crypto';

export type NarrationEngine = 'fake' | 'elevenlabs' | 'openai';

export type NarrationKeyInput = {
  text: string;
  voice: string;
  engine: NarrationEngine;
  version: 1;
  speed: number;
  lang: string;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonical(nested)]),
  );
}

export function narrationKey(input: NarrationKeyInput): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(input)))
    .digest('hex');
}
