import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function filesUnder(dir: string, accepts: (name: string) => boolean): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path, accepts) : accepts(name) ? [path] : [];
  });
}

export const isSourceFile = (name: string): boolean => /\.[cm]?[jt]sx?$/.test(name);
