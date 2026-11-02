import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ControlDecl, GameModule, SaveData } from '@ogm/contracts/game';
import { build } from 'esbuild';

import type { GameSource, PreviousBuild } from './types.js';

type AnyModule = GameModule<unknown, unknown>;

function isModule(value: unknown): value is AnyModule {
  const candidate = value as Partial<AnyModule> | null;
  return !!candidate && typeof candidate === 'object' && !!candidate.manifest && Array.isArray(candidate.controls);
}

/** The game's `GameModule`: `export const game`, `createGame().module`, or any exported module. */
function findModule(exports: Record<string, unknown>): AnyModule {
  if (isModule(exports.game)) return exports.game;
  if (typeof exports.createGame === 'function') {
    const created = (exports.createGame as () => { module?: unknown })().module;
    if (isModule(created)) return created;
  }
  const found = Object.values(exports).find(isModule);
  if (!found) throw new Error('src/game.ts exports no GameModule (`game` or `createGame().module`)');
  return found;
}

/** Entity ids across `<dir>/*.json` (`{ entities: { [id]: … } }`). */
export async function designEntityIds(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const ids: string[] = [];
  for (const name of (await readdir(dir)).filter((file) => file.endsWith('.json')).sort()) {
    const doc = JSON.parse(await readFile(join(dir, name), 'utf8')) as { entities?: Record<string, unknown> };
    ids.push(...Object.keys(doc.entities ?? {}));
  }
  return ids;
}

/** Bundles `<gameDir>/src/game.ts` for Node and reads the manifest, controls and default design. */
export async function loadGame(gameDir: string, workDir: string): Promise<GameSource> {
  const outfile = join(workDir, 'game.mjs');
  await build({
    entryPoints: [join(gameDir, 'src/game.ts')],
    absWorkingDir: gameDir,
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
    define: { __GM_BUILD__: '"test"' },
  });
  const module = findModule((await import(pathToFileURL(outfile).href)) as Record<string, unknown>);
  return {
    dir: gameDir,
    manifest: module.manifest,
    controls: module.controls,
    design: module.designSchema.parse({}) as Record<string, unknown>,
    entityIds: await designEntityIds(join(gameDir, 'design')),
    hasMigrateOverride: typeof module.migrateOverride === 'function',
  };
}

/** Records this run so its out dir can be the next run's `--previous`. */
export async function writeRunRecord(outDir: string, game: GameSource): Promise<void> {
  await writeFile(
    join(outDir, 'manifest.json'),
    `${JSON.stringify({ ...game.manifest, controls: game.controls }, null, 2)}\n`,
  );
  const design = join(game.dir, 'design');
  if (existsSync(design)) await cp(design, join(outDir, 'design'), { recursive: true });
  else await mkdir(join(outDir, 'design'), { recursive: true });
}

/** `<dir>/manifest.json` (with `controls`), `<dir>/design/*.json` and an optional `<dir>/save.json`. */
export async function loadPrevious(dir: string): Promise<PreviousBuild> {
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')) as { controls?: ControlDecl[] };
  const savePath = join(dir, 'save.json');
  return {
    controlIds: (manifest.controls ?? []).map((control) => control.id),
    entityIds: await designEntityIds(join(dir, 'design')),
    save: existsSync(savePath) ? (JSON.parse(await readFile(savePath, 'utf8')) as SaveData<unknown>) : undefined,
  };
}

export async function readJsonIfPresent<T>(path: string): Promise<T | undefined> {
  return existsSync(path) ? (JSON.parse(await readFile(path, 'utf8')) as T) : undefined;
}
