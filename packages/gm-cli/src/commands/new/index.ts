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
import { dirname, join, resolve } from 'node:path';

import { loadFamilies } from '@ogm/asset-cards';

import { EXIT, UsageError, type GmCommand } from '../../command.js';
import { AGENTS_MD } from '../../skills/agents-md.js';
import {
  gmCliVersion,
  locatePackAdapterPackage,
  locateSkillPack,
  locateTemplates,
  syncSkillPack,
} from '../../skills/pack.js';

const TEMPLATES = new Set(['game-2d', 'game-3d', 'game-multiplayer']);

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

function destinationIsEmpty(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory() && readdirSync(path).length === 0;
}

export const command: GmCommand = {
  name: 'new',
  summary: 'create a scaffold-only game repo with the committed skill pack',
  usage: '<game-2d|game-3d|game-multiplayer> <dir> [--family id] [--set id] [--pov id]',
  example: 'new game-2d my-game --family isometric-2d --set smallscaleint --pov side',
  flags: {
    family: { type: 'string', help: 'record the chosen style-family id' },
    set: { type: 'string', help: 'pin one registered style-set adapter and skill' },
    pov: { type: 'string', help: 'record the chosen point-of-view id' },
  },
  async run(ctx, args, flags) {
    if (args.length !== 2) throw new UsageError('gm new needs a template and directory', 'gm help new');
    const [template, requested] = args;
    if (!TEMPLATES.has(template)) throw new UsageError(`unknown template "${template}"`, 'gm help new');
    const templates = locateTemplates(ctx.cwd);
    const source = templates ? join(templates, template) : '';
    if (!source || !existsSync(source) || !statSync(source).isDirectory()) {
      throw new UsageError(`template "${template}" is unavailable`, 'install the matching platform template');
    }
    const destination = resolve(ctx.cwd, requested);
    if (existsSync(destination) && !destinationIsEmpty(destination)) {
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
    ctx.out(`created ${destination}. Next: cd ${destination} && pnpm install --offline`);
    ctx.emit('new.create', { template, family: family ?? null, set: set ?? null, pov: pov ?? null });
    return EXIT.ok;
  },
};
