import { existsSync, readdirSync, statSync } from 'node:fs';

export function isEmptyDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory() && readdirSync(path).length === 0;
}
