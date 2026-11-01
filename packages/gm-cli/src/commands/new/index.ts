import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
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
import { gmCliVersion, locateSkillPack, locateTemplates, syncSkillPack } from '../../skills/pack.js';

const TEMPLATES = new Set(['game-2d', 'game-3d', 'game-multiplayer']);

function copyContents(source: string, destination: string): void {
  for (const entry of readdirSync(source)) {
    cpSync(join(source, entry), join(destination, entry), { recursive: true });
  }
}

/** `--family` takes a family id from the same registry `gm assets search` reads; a set id names its family. */
function validateFamily(family: string | undefined): void {
  if (!family) return;
  const families = loadFamilies();
  if (families.some((entry) => entry.id === family)) return;
  const parent = families.find((entry) => entry.sets.some((set) => set.id === family));
  if (parent) {
    throw new UsageError(`"${family}" is a style set, not a family`, `use --family ${parent.id}`);
  }
  throw new UsageError(
    `unknown style family "${family}"`,
    `choose one of ${families.map((entry) => entry.id).join(', ')}`,
  );
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
    validateFamily(family);
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
      if (existsSync(destination)) rmdirSync(destination);
      renameSync(staging, destination);
    } finally {
      if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    }
    ctx.out(`created ${destination}. Next: cd ${destination} && pnpm install --offline`);
    ctx.emit('new.create', { template, family: family ?? null, pov: pov ?? null });
    return EXIT.ok;
  },
};
