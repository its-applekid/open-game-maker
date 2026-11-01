import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { listFiles, TEMPLATES, WORKSPACE_ROOT } from './files.js';

export type SkillPack = {
  version: string;
  lock: string;
  // Paths relative to `.claude/skills/`, e.g. `gm-core/SKILL.md`.
  files: { path: string; content: string }[];
};

// The `gm-*` pack from `<root>/skills` (OGM-091) when it exists, else the placeholder shipped in this package.
export function skillPack(root: string = WORKSPACE_ROOT): SkillPack {
  const real = join(root, 'skills');
  const source = hasPack(real) ? real : join(TEMPLATES, 'skills');
  const lock = readFileSync(join(source, 'skills.lock'), 'utf8');
  const parsed = JSON.parse(lock) as { pack?: unknown };
  if (typeof parsed.pack !== 'string' || parsed.pack === '')
    throw new Error(`${source}/skills.lock has no pack version`);
  const files = skillNames(source).flatMap((name) =>
    listFiles(join(source, name)).map((path) => ({
      path: `${name}/${path}`,
      content: readFileSync(join(source, name, path), 'utf8'),
    })),
  );
  return { version: parsed.pack, lock, files };
}

export function skillNames(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('gm-'))
    .map((entry) => entry.name)
    .sort();
}

function hasPack(dir: string): boolean {
  return existsSync(join(dir, 'skills.lock')) && skillNames(dir).length > 0;
}
