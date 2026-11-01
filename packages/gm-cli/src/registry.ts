import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { GmCommand } from './command.js';

export type Registry = Map<string, GmCommand & { file: string }>;

function isCommandFile(name: string): boolean {
  return /\.(js|ts)$/.test(name) && !name.endsWith('.d.ts') && !/\.test\.(js|ts)$/.test(name);
}

/** Scan `<dir>/<namespace>/<cmd>.{js,ts}` and import each file's `command`; duplicate names throw naming both files. */
export async function loadCommands(dir: string): Promise<Registry> {
  const registry: Registry = new Map();
  for (const namespace of readdirSync(dir).sort()) {
    const nsDir = join(dir, namespace);
    if (!statSync(nsDir).isDirectory()) continue;
    for (const name of readdirSync(nsDir).filter(isCommandFile).sort()) {
      const file = join(nsDir, name);
      const mod = (await import(pathToFileURL(file).href)) as { command?: GmCommand };
      if (!mod.command) throw new Error(`${file} does not export \`command\``);
      const existing = registry.get(mod.command.name);
      if (existing) throw new Error(`duplicate command "${mod.command.name}" in ${existing.file} and ${file}`);
      registry.set(mod.command.name, { ...mod.command, file });
    }
  }
  return registry;
}

/** The longest registered name that prefixes argv, e.g. `assets search orc` → `assets search`. */
export function match(registry: Registry, argv: string[]): { command: GmCommand; rest: string[] } | null {
  const words = argv.filter((arg, i) => !arg.startsWith('-') && argv.slice(0, i).every((a) => !a.startsWith('-')));
  for (let n = words.length; n > 0; n -= 1) {
    const command = registry.get(words.slice(0, n).join(' '));
    if (command) return { command, rest: argv.slice(n) };
  }
  return null;
}
