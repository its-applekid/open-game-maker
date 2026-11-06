import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { loadFamilies } from '@ogm/asset-cards';

import { EXIT, UsageError, type GmCommand } from '../../command.js';
import { resolveContainedPath } from '../../context.js';
import { isEmptyDirectory } from '../../filesystem.js';
import { AGENTS_MD } from '../../skills/agents-md.js';
import {
  gmCliVersion,
  locatePackAdapterPackage,
  locateSkillPack,
  locateTemplates,
  syncSkillPack,
} from '../../skills/pack.js';

const TEMPLATES = new Set(['game-2d', 'game-3d', 'game-multiplayer']);
const GAME_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function copyContents(source: string, destination: string): void {
  for (const entry of readdirSync(source)) {
    cpSync(join(source, entry), join(destination, entry), { recursive: true });
  }
}

/** Style ids come from the same registry `gm assets search` reads. */
function validateStyle(family: string | undefined, set: string | undefined): void {
  const families = loadFamilies();
  if (family && !families.some((entry) => entry.id === family)) {
    const parent = families.find((entry) => entry.sets.some((entry) => entry.id === family));
    if (parent) {
      throw new UsageError(`"${family}" is a style set, not a family`, `use --family ${parent.id}`);
    }
    throw new UsageError(
      `unknown style family "${family}"`,
      `choose one of ${families.map((entry) => entry.id).join(', ')}`,
    );
  }
  if (!set) return;
  const parent = families.find((entry) => entry.sets.some((entry) => entry.id === set));
  if (!parent) {
    throw new UsageError(
      `unknown style set "${set}"`,
      `choose one of ${families.flatMap((entry) => entry.sets.map((entry) => entry.id)).join(', ')}`,
    );
  }
  if (family && parent.id !== family) {
    throw new UsageError(
      `style set "${set}" belongs to family "${parent.id}", not "${family}"`,
      `use --family ${parent.id}`,
    );
  }
}

function adapterVersion(cwd: string, set: string): string {
  const packagePath = locatePackAdapterPackage(cwd, set);
  if (!packagePath) return gmCliVersion();
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as { name?: unknown; version?: unknown };
  if (packageJson.name !== `@gm/pack-${set}` || typeof packageJson.version !== 'string') {
    throw new Error(`invalid adapter package metadata: ${packagePath}`);
  }
  return packageJson.version;
}

function pinAdapter(gameDir: string, set: string, version: string): void {
  const packagePath = join(gameDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  packageJson.dependencies = Object.fromEntries(
    Object.entries({ ...(packageJson.dependencies ?? {}), [`@gm/pack-${set}`]: version }).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  );
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

async function readPackageJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function findInstanceGames(start: string): Promise<string | null> {
  let current = resolve(start);
  for (;;) {
    const packagePath = join(current, 'package.json');
    if (existsSync(packagePath)) {
      const packageJson = await readPackageJson(packagePath);
      const instance = (packageJson?.gameMaker as { instance?: unknown } | undefined)?.instance;
      const gamesPath = join(current, 'games');
      const packagesPath = join(current, 'packages');
      if (instance === true && existsSync(join(current, 'pnpm-workspace.yaml'))) {
        const [games, packages] = await Promise.all([
          resolveContainedPath(current, gamesPath).catch(() => null),
          resolveContainedPath(current, packagesPath).catch(() => null),
        ]);
        if (games && packages && statSync(games).isDirectory() && statSync(packages).isDirectory()) return games;
      }
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function nameGamePackage(gameDir: string, slug: string): void {
  const packagePath = join(gameDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as Record<string, unknown>;
  packageJson.name = `@game/${slug}`;
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function removeCoreWorkspaceReferences(gameDir: string): void {
  const tsconfigPath = join(gameDir, 'tsconfig.json');
  if (!existsSync(tsconfigPath)) return;
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8')) as {
    references?: Array<{ path?: unknown }>;
  };
  if (!tsconfig.references) return;
  tsconfig.references = tsconfig.references.filter(
    (reference) =>
      typeof reference.path !== 'string' ||
      !/^\.\.\/\.\.\/packages\/(contracts|iframe-bridge|sdk)$/.test(reference.path),
  );
  if (tsconfig.references.length === 0) delete tsconfig.references;
  writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
}

export const command: GmCommand = {
  name: 'new',
  summary: 'add a scaffold-only game to the instance repository',
  usage: '<game-2d|game-3d|game-multiplayer> <slug> [--family id] [--set id] [--pov id]',
  example: 'new game-2d my-game --family isometric-2d --set smallscaleint --pov side',
  flags: {
    family: { type: 'string', help: 'record the chosen style-family id' },
    set: { type: 'string', help: 'pin one registered style-set adapter and skill' },
    pov: { type: 'string', help: 'record the chosen point-of-view id' },
  },
  async run(ctx, args, flags) {
    if (args.length !== 2) throw new UsageError('gm new needs a template and game slug', 'gm help new');
    const [template, requested] = args;
    if (!TEMPLATES.has(template)) throw new UsageError(`unknown template "${template}"`, 'gm help new');
    if (!GAME_SLUG.test(requested)) {
      throw new UsageError(`invalid game slug "${requested}"`, 'use lower-case letters, numbers, and single hyphens');
    }
    const gamesRoot = await findInstanceGames(ctx.cwd);
    if (!gamesRoot) {
      throw new UsageError('not inside a Game Maker instance repository', 'run gm instance init <dir> first');
    }
    const templates = locateTemplates(ctx.cwd);
    const source = templates ? join(templates, template) : '';
    if (!source || !existsSync(source) || !statSync(source).isDirectory()) {
      throw new UsageError(`template "${template}" is unavailable`, 'install the matching platform template');
    }
    const destination = join(gamesRoot, requested);
    if (existsSync(destination) && !isEmptyDirectory(destination)) {
      throw new UsageError(`destination is not empty: ${destination}`, 'choose an empty directory');
    }
    const family = typeof flags.family === 'string' ? flags.family : undefined;
    const set = typeof flags.set === 'string' ? flags.set : undefined;
    const pov = typeof flags.pov === 'string' ? flags.pov : undefined;
    validateStyle(family, set);
    const packDir = locateSkillPack(ctx.cwd, ctx.skillsDir);

    mkdirSync(dirname(destination), { recursive: true });
    const staging = mkdtempSync(join(dirname(destination), '.gm-new-stage-'));
    try {
      copyContents(source, staging);
      nameGamePackage(staging, requested);
      removeCoreWorkspaceReferences(staging);
      if (set) pinAdapter(staging, set, adapterVersion(ctx.cwd, set));
      syncSkillPack({ repoDir: staging, packDir, set });
      writeFileSync(join(staging, 'AGENTS.md'), AGENTS_MD);
      writeFileSync(
        join(staging, 'gm.lock.json'),
        `${JSON.stringify(
          {
            v: 1,
            template,
            ...(family ? { family } : {}),
            ...(set ? { set } : {}),
            ...(pov ? { pov } : {}),
            createdAt: new Date().toISOString(),
            gmVersion: gmCliVersion(),
          },
          null,
          2,
        )}\n`,
      );
      if (existsSync(destination)) rmdirSync(destination);
      renameSync(staging, destination);
    } finally {
      if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    }
    ctx.out(
      `created ${destination}. Next: cd ${dirname(gamesRoot)} && pnpm install --offline (refreshes pnpm-lock.yaml; commit it)`,
    );
    ctx.emit('new.create', { game: requested, template, family: family ?? null, set: set ?? null, pov: pov ?? null });
    return EXIT.ok;
  },
};
