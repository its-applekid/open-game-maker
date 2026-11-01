import { parseArgs } from 'node:util';

import { UsageError, type FlagSpec } from './command.js';

export const SHARED_FLAGS: FlagSpec = {
  json: { type: 'boolean', default: false, help: 'one JSON object per line' },
  limit: { type: 'number', default: 10, help: 'at most N rows' },
  fields: { type: 'string', help: 'with --json, keep only these top-level keys (a,b)' },
  help: { type: 'boolean', default: false, help: 'show help for this command' },
};

export function parseFlags(
  name: string,
  spec: FlagSpec,
  argv: string[],
): { args: string[]; flags: Record<string, unknown> } {
  const all = { ...SHARED_FLAGS, ...spec };
  const options = Object.fromEntries(
    Object.entries(all).map(([flag, def]) => [flag, { type: def.type === 'boolean' ? 'boolean' : 'string' }] as const),
  );
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ args: argv, options, allowPositionals: true, strict: true });
  } catch (error) {
    const cause = (error instanceof Error ? error.message : String(error)).split('\n')[0].replace(/\.$/, '');
    throw new UsageError(cause, `gm help ${name}`);
  }
  const flags: Record<string, unknown> = {};
  for (const [flag, def] of Object.entries(all)) {
    const raw = parsed.values[flag];
    if (raw === undefined) {
      if (def.default !== undefined) flags[flag] = def.default;
      continue;
    }
    if (def.type === 'number') {
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0)
        throw new UsageError(`--${flag} needs a whole number`, `gm help ${name}`);
      flags[flag] = value;
    } else flags[flag] = raw;
  }
  return { args: parsed.positionals, flags };
}
