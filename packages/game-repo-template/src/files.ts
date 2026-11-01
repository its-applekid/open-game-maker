import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Package templates (works from `src/` under Vitest and from `dist/`).
export const TEMPLATES = fileURLToPath(new URL('../templates/', import.meta.url));
// The monorepo root, where `skills/gm-*` (OGM-091) and `templates/game-*` (OGM-023/024/055) live once they land.
export const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export function readTemplate(name: string): string {
  return readFileSync(join(TEMPLATES, name), 'utf8');
}

// Every regular file under `dir`, as sorted POSIX paths relative to it.
export function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) out.push(relative(dir, path).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

export function isExecutable(path: string): boolean {
  return (statSync(path).mode & 0o111) !== 0;
}

export function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}
