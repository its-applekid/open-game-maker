import { existsSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

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

export async function repoVisibility(cwd: string, override?: unknown): Promise<'public' | 'private'> {
  if (override === 'public' || override === 'private') return override;
  if (override !== undefined) {
    throw new UsageError('--repo-visibility must be public or private', 'gm check assets --repo-visibility public');
  }
  try {
    const game = JSON.parse(await readFile(join(cwd, '.gm/game.json'), 'utf8')) as { visibility?: string };
    return game.visibility === 'public' ? 'public' : 'private';
  } catch {
    return 'private';
  }
}

export async function resolveContainedPath(root: string, candidate: string): Promise<string | null> {
  const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
  const local = relative(realRoot, realCandidate);
  return local === '' || (!isAbsolute(local) && local !== '..' && !local.startsWith(`..${sep}`))
    ? realCandidate
    : null;
}

/** Print one JSON line, keeping only `--fields` keys when given. */
export function printJson(ctx: GmContext, value: object): void {
  const record = value as Record<string, unknown>;
  const kept = ctx.fields
    ? Object.fromEntries(ctx.fields.filter((key) => key in record).map((key) => [key, record[key]]))
    : value;
  ctx.out(JSON.stringify(kept));
}
