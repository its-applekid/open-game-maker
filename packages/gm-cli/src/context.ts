import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { UsageError, type GmContext } from './command.js';

/** `OGM_ASSETS_ROOT` (relative to cwd), else the nearest `assets-local/` above cwd that holds `catalog.json`. */
export function findAssetsRoot(cwd: string, fromEnv: string | undefined): string | null {
  if (fromEnv) return resolve(cwd, fromEnv);
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'assets-local', 'catalog.json'))) return join(dir, 'assets-local');
    if (dirname(dir) === dir) return null;
  }
}

export function requireAssetsRoot(ctx: GmContext): string {
  if (ctx.assetsRoot) return ctx.assetsRoot;
  throw new UsageError(
    'no asset library found: OGM_ASSETS_ROOT is unset and no assets-local/catalog.json is above this directory',
    'OGM_ASSETS_ROOT=/path/to/assets-local gm assets search <words>',
  );
}

/** Print one JSON line, keeping only `--fields` keys when given. */
export function printJson(ctx: GmContext, value: object): void {
  const record = value as Record<string, unknown>;
  const kept = ctx.fields
    ? Object.fromEntries(ctx.fields.filter((key) => key in record).map((key) => [key, record[key]]))
    : value;
  ctx.out(JSON.stringify(kept));
}
