import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { EXIT, UsageError, type GmCommand } from '../../command.js';
import { AGENTS_MD } from '../../skills/agents-md.js';
import {
  gmCliVersion,
  locateSkillPack,
  locateStyleFamilies,
  locateTemplates,
  syncSkillPack,
} from '../../skills/pack.js';

const TEMPLATES = new Set(['game-2d', 'game-3d', 'game-multiplayer']);

function copyContents(source: string, destination: string): void {
  for (const entry of readdirSync(source)) {
    cpSync(join(source, entry), join(destination, entry), { recursive: true });
  }
}

function validateFamily(cwd: string, family: string | undefined): 'valid' | 'unavailable' {
  if (!family) return 'valid';
  const registry = locateStyleFamilies(cwd);
  if (!registry) return 'unavailable';
  const parsed = JSON.parse(readFileSync(registry, 'utf8')) as Array<{ id?: unknown }>;
  if (!parsed.some((entry) => entry.id === family)) {
    throw new UsageError(`unknown style family "${family}"`, 'choose an id from style-families.json');
  }
  return 'valid';
}

function destinationIsEmpty(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory() && readdirSync(path).length === 0;
}

export const command: GmCommand = {
  name: 'new',
  summary: 'create a scaffold-only game repo with the committed skill pack',
  usage: '<game-2d|game-3d|game-multiplayer> <dir> [--family id] [--pov id]',
  example: 'new game-2d my-game --family pixel-art --pov side',
  flags: {
    family: { type: 'string', help: 'record the chosen style-family id' },
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
    const pov = typeof flags.pov === 'string' ? flags.pov : undefined;
    const familyStatus = validateFamily(ctx.cwd, family);
    const packDir = locateSkillPack(ctx.cwd, ctx.skillsDir);

    mkdirSync(dirname(destination), { recursive: true });
    const staging = mkdtempSync(join(dirname(destination), '.gm-new-stage-'));
    try {
      copyContents(source, staging);
      syncSkillPack({ repoDir: staging, packDir });
      writeFileSync(join(staging, 'AGENTS.md'), AGENTS_MD);
      writeFileSync(
        join(staging, 'gm.lock.json'),
        `${JSON.stringify(
          {
            v: 1,
            template,
            ...(family ? { family } : {}),
            ...(pov ? { pov } : {}),
            createdAt: new Date().toISOString(),
            gmVersion: gmCliVersion(),
          },
          null,
          2,
        )}\n`,
      );
      if (existsSync(destination)) rmSync(destination, { recursive: true });
      renameSync(staging, destination);
    } finally {
      if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    }
    if (family && familyStatus === 'unavailable') {
      ctx.err(`style families are unavailable; recorded --family ${family} without validation`);
    }
    ctx.out(`created ${destination}. Next: cd ${destination} && pnpm install --offline`);
    ctx.emit('new.create', { template, family: family ?? null, pov: pov ?? null });
    return EXIT.ok;
  },
};
