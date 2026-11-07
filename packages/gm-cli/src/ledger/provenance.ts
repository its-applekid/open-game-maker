import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { OptionProvenance } from '@ogm/contracts';

import { UsageError } from '../command.js';

export const OPTION_ID = /^[a-z0-9_-]{1,32}$/;

export function strings(flags: Record<string, unknown>, name: string): string[] {
  const value = flags[name];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return typeof value === 'string' ? [value] : [];
}

/** Split `<id>=<value>` for a repeated option flag and refuse anything that is not a safe option id. */
export function pair(raw: string, flag: string): [string, string] {
  const separator = raw.indexOf('=');
  const id = raw.slice(0, separator).trim();
  const value = separator < 0 ? '' : raw.slice(separator + 1).trim();
  if (!OPTION_ID.test(id) || !value)
    throw new UsageError(`--${flag} needs id=value with id matching [a-z0-9_-]{1,32}`, 'gm help options check');
  return [id, value];
}

/**
 * `--provenance <id>=<json>` or `--provenance <id>=@<file>`: what an option was built from. The file form is relative to
 * the game workspace and holds one provenance document.
 */
export function provenancePairs(flags: Record<string, unknown>, root: string): Map<string, OptionProvenance> {
  const provenance = new Map<string, OptionProvenance>();
  for (const raw of strings(flags, 'provenance')) {
    const [id, value] = pair(raw, 'provenance');
    if (provenance.has(id))
      throw new UsageError(`option "${id}" has more than one provenance`, 'pass one --provenance per option');
    let text = value;
    if (value.startsWith('@')) {
      const path = resolve(root, value.slice(1));
      try {
        text = readFileSync(path, 'utf8');
      } catch (error) {
        throw new UsageError(
          `cannot read provenance file ${value.slice(1)}: ${error instanceof Error ? error.message : String(error)}`,
          'gm help options check',
        );
      }
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new UsageError(`--provenance ${id}= is not valid JSON`, 'gm help options check');
    }
    const parsed = OptionProvenance.safeParse(json);
    if (!parsed.success)
      throw new UsageError(
        `--provenance ${id}= is not a valid provenance: ${parsed.error.message}`,
        'gm help options check',
      );
    provenance.set(id, parsed.data);
  }
  return provenance;
}
