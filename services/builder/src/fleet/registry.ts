import { join } from 'node:path';

import { parse, stringify } from 'yaml';

import { readIfPresent, writeAtomic } from './secrets.js';
import type { DaemonRow } from './types.js';

type Instance = { url: string; token_file: string } | Record<string, unknown>;
type Registry = { version: 1; instances: Record<string, Instance> };

export function registryPath(home: string): string {
  return join(home, '.aiur/remote-instances.yaml');
}

// Upserts one `instances.<slug>` entry per daemon in ~/.aiur/remote-instances.yaml, keeping every other entry
// (the platform fleet's own instances live in the same file).
export async function writeRegistry(home: string, rows: readonly DaemonRow[]): Promise<void> {
  const path = registryPath(home);
  const text = await readIfPresent(path);
  const current = text ? (parse(text) as Partial<Registry> | null) : null;
  const instances: Record<string, Instance> = { ...(current?.instances ?? {}) };

  for (const row of rows) {
    instances[row.slug] = {
      url: `http://127.0.0.1:${row.port}`,
      token_file: `~/.config/ogm/daemons/${row.slug}/read-token`,
    };
  }

  await writeAtomic(path, stringify({ version: 1, instances } satisfies Registry), 0o600);
}
