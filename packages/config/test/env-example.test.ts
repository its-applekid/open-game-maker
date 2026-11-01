import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { OGM_ENV_NAMES } from '../src/names.js';

const examplePath = fileURLToPath(new URL('../../../.env.example', import.meta.url));

describe('.env.example', () => {
  it('lists every registered name in order with no values', () => {
    const lines = readFileSync(examplePath, 'utf8').split(/\r?\n/);
    const entries = lines.flatMap((line, index) => {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      return match ? [{ name: match[1], value: match[2], index }] : [];
    });

    expect(entries.map(({ name }) => name)).toEqual(OGM_ENV_NAMES.map(({ name }) => name));

    for (const [index, entry] of entries.entries()) {
      const registryEntry = OGM_ENV_NAMES[index];
      expect(entry.value, `value present for ${entry.name}`).toBe('');
      expect(lines[entry.index - 1], `wrong comment for ${entry.name}`).toBe(
        `# [${registryEntry.unit}] ${registryEntry.doc}`,
      );
    }
  });
});
