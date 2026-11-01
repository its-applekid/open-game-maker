import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { UsageError } from '../command.js';

export type SkillsLock = {
  v: 1;
  pack: string;
  installedAt: string;
  skills: Record<string, { sha256: string }>;
  vendored: Record<string, string>;
  linkMode?: 'copy';
};

export function readVendorPins(packDir: string): Record<string, string> {
  const file = join(packDir, 'vendor', 'skills.lock');
  if (!existsSync(file)) return {};
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { sets?: Record<string, { sha?: unknown }> };
  return Object.fromEntries(
    Object.entries(parsed.sets ?? {}).flatMap(([name, entry]) =>
      typeof entry.sha === 'string' ? [[name, entry.sha] as const] : [],
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isManagedPath(path: string): boolean {
  return (
    path.length > 0 &&
    !isAbsolute(path) &&
    !path.includes('\\') &&
    path.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
  );
}

export function readSkillsLock(repoDir: string): SkillsLock | null {
  const file = join(repoDir, 'skills.lock');
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<SkillsLock>;
    if (parsed.v !== 1 || typeof parsed.pack !== 'string' || typeof parsed.installedAt !== 'string') throw new Error();
    if (!isRecord(parsed.skills) || !isRecord(parsed.vendored)) throw new Error();
    if (
      !Object.entries(parsed.skills).every(
        ([path, entry]) =>
          isManagedPath(path) &&
          isRecord(entry) &&
          typeof entry.sha256 === 'string' &&
          /^[a-f0-9]{64}$/.test(entry.sha256),
      )
    )
      throw new Error();
    if (!Object.values(parsed.vendored).every((sha) => typeof sha === 'string')) throw new Error();
    if (parsed.linkMode !== undefined && parsed.linkMode !== 'copy') throw new Error();
    return parsed as SkillsLock;
  } catch {
    throw new UsageError('skills.lock is not valid', 'restore it or remove it before gm skills sync');
  }
}

export function writeSkillsLock(repoDir: string, lock: SkillsLock): void {
  const temporary = join(repoDir, `.skills.lock.${process.pid}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(lock, null, 2)}\n`);
  renameSync(temporary, join(repoDir, 'skills.lock'));
}
