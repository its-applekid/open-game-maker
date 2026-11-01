import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { UsageError } from '../command.js';
import { readSkillsLock, type SkillsLock, writeSkillsLock } from './lock.js';

export { readSkillsLock, type SkillsLock } from './lock.js';

type SourceFile = { path: string; source: string; sha256: string };
type DiscoverySkill = { name: string; target: string };
type FileState = 'clean' | 'missing' | 'outdated' | 'local-edit' | 'removed';
type CreateLink = (target: string, path: string) => void;

export type SyncSkillPackOptions = {
  repoDir: string;
  packDir: string;
  force?: boolean;
  checkOnly?: boolean;
  createLink?: CreateLink;
};

export type SyncSkillPackResult = {
  changed: boolean;
  drift: boolean;
  actions: string[];
  lock: SkillsLock | null;
};

const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DEFAULT_PACK = fileURLToPath(new URL('../../../../skills/', import.meta.url));
const DEFAULT_TEMPLATES = fileURLToPath(new URL('../../../../templates/', import.meta.url));
const DEFAULT_FAMILIES = fileURLToPath(new URL('../../../asset-cards/data/style-families.json', import.meta.url));

function slash(path: string): string {
  return path.split(sep).join('/');
}

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function walkFiles(root: string, prefix = ''): string[] {
  const dir = join(root, prefix);
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = slash(join(prefix, entry.name));
    if (entry.isDirectory()) files.push(...walkFiles(root, path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export function gmCliVersion(): string {
  const parsed = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as { version?: unknown };
  if (typeof parsed.version !== 'string') throw new Error('gm-cli package.json has no version');
  return parsed.version;
}

function readVendorPins(packDir: string): Record<string, string> {
  const file = join(packDir, 'vendor', 'skills.lock');
  if (!existsSync(file)) return {};
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
    sets?: Record<string, { sha?: unknown }>;
  };
  return Object.fromEntries(
    Object.entries(parsed.sets ?? {}).flatMap(([name, entry]) =>
      typeof entry.sha === 'string' ? [[name, entry.sha] as const] : [],
    ),
  );
}

function sourcePack(packDir: string): { files: SourceFile[]; discovery: DiscoverySkill[] } {
  const roots = readdirSync(packDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && (entry.name.startsWith('gm-') || entry.name === 'vendor'))
    .map((entry) => entry.name)
    .sort();
  const files = roots.flatMap((root) =>
    walkFiles(packDir, root).map((path) => ({
      path,
      source: join(packDir, path),
      sha256: sha256(join(packDir, path)),
    })),
  );
  const discovery: DiscoverySkill[] = [];
  for (const file of files.filter(({ path }) => path.endsWith('/SKILL.md'))) {
    const target = file.path.slice(0, -'/SKILL.md'.length);
    const name = target.startsWith('vendor/') ? target.split('/').at(-1) : target;
    if (!name) continue;
    const collision = discovery.find((skill) => skill.name === name);
    if (collision) throw new Error(`skill discovery name "${name}" is shared by ${collision.target} and ${target}`);
    discovery.push({ name, target });
  }
  return { files, discovery: discovery.sort((a, b) => a.name.localeCompare(b.name)) };
}

export function locateSkillPack(cwd: string, configured: string | null): string {
  if (configured) {
    const candidate = resolve(cwd, configured);
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate;
    throw new UsageError(`skill pack not found: ${candidate}`, 'set GM_SKILLS_DIR to the platform skills directory');
  }
  if (existsSync(DEFAULT_PACK)) return DEFAULT_PACK;
  throw new UsageError('skill pack not found beside gm-cli', 'set GM_SKILLS_DIR to the platform skills directory');
}

function findUp(cwd: string, child: string): string | null {
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    const candidate = join(dir, child);
    if (existsSync(candidate)) return candidate;
    if (dirname(dir) === dir) return null;
  }
}

export function locateTemplates(cwd: string): string | null {
  return findUp(cwd, 'templates') ?? (existsSync(DEFAULT_TEMPLATES) ? DEFAULT_TEMPLATES : null);
}

export function locateStyleFamilies(cwd: string): string | null {
  return (
    findUp(cwd, 'packages/asset-cards/data/style-families.json') ??
    (existsSync(DEFAULT_FAMILIES) ? DEFAULT_FAMILIES : null)
  );
}

function installedHash(root: string, path: string): string | null {
  const file = join(root, path);
  return existsSync(file) && statSync(file).isFile() ? sha256(file) : null;
}

function assessFiles(installedRoot: string, source: SourceFile[], oldLock: SkillsLock | null): Map<string, FileState> {
  const states = new Map<string, FileState>();
  const sourcePaths = new Set(source.map(({ path }) => path));
  for (const file of source) {
    const current = installedHash(installedRoot, file.path);
    const previous = oldLock?.skills[file.path]?.sha256;
    if (current === file.sha256) states.set(file.path, 'clean');
    else if (current === null) states.set(file.path, 'missing');
    else if (previous === undefined || current !== previous) states.set(file.path, 'local-edit');
    else states.set(file.path, 'outdated');
  }
  for (const [path, entry] of Object.entries(oldLock?.skills ?? {})) {
    if (sourcePaths.has(path)) continue;
    const current = installedHash(installedRoot, path);
    if (current === entry.sha256) states.set(path, 'removed');
    else if (current !== null) states.set(path, 'local-edit');
  }
  return states;
}

function oldDiscoverySkills(lock: SkillsLock | null): DiscoverySkill[] {
  const skills: DiscoverySkill[] = [];
  for (const path of Object.keys(lock?.skills ?? {}).filter((candidate) => candidate.endsWith('/SKILL.md'))) {
    const target = path.slice(0, -'/SKILL.md'.length);
    const name = target.startsWith('vendor/') ? target.split('/').at(-1) : target;
    if (name && !skills.some((skill) => skill.name === name)) skills.push({ name, target });
  }
  return skills;
}

function managedTreeMatches(source: string, installed: string): boolean {
  if (!existsSync(source) || !existsSync(installed)) return false;
  return walkFiles(source).every((path) => installedHash(installed, path) === sha256(join(source, path)));
}

function linkDrift(repoDir: string, skills: DiscoverySkill[], lock: SkillsLock | null): string[] {
  const drift: string[] = [];
  for (const parentName of ['.codex', '.agents']) {
    const parent = join(repoDir, parentName, 'skills');
    for (const skill of skills) {
      const path = join(parent, skill.name);
      const canonical = join(repoDir, '.claude', 'skills', skill.target);
      const expected = slash(relative(parent, canonical));
      if (!existsSync(path) && !lstatExists(path)) drift.push(`missing link ${parentName}/skills/${skill.name}`);
      else if (lstatSync(path).isSymbolicLink()) {
        if (readlinkSync(path) !== expected || !existsSync(path))
          drift.push(`stale link ${parentName}/skills/${skill.name}`);
      } else if (lock?.linkMode !== 'copy' || !managedTreeMatches(canonical, path)) {
        drift.push(`stale link ${parentName}/skills/${skill.name}`);
      }
    }
  }
  return drift;
}

function lstatExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function copyContents(source: string, destination: string): void {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source)) {
    cpSync(join(source, entry), join(destination, entry), { recursive: true, force: true });
  }
}

function replaceDirectory(destination: string, staging: string): void {
  if (!existsSync(destination)) {
    renameSync(staging, destination);
    return;
  }
  const backup = mkdtempSync(join(dirname(destination), '.gm-skills-backup-'));
  rmSync(backup, { recursive: true });
  renameSync(destination, backup);
  try {
    renameSync(staging, destination);
    rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (!existsSync(destination)) renameSync(backup, destination);
    throw error;
  }
}

function refreshManagedCopy(
  source: string,
  destination: string,
  target: string,
  oldLock: SkillsLock,
  force: boolean,
): { changed: boolean; localEdits: boolean } {
  let changed = false;
  let localEdits = false;
  const sourceFiles = new Set(walkFiles(source));
  for (const path of sourceFiles) {
    const sourceHash = sha256(join(source, path));
    const currentHash = installedHash(destination, path);
    if (currentHash === sourceHash) continue;
    const previousHash = oldLock.skills[slash(join(target, path))]?.sha256;
    if (currentHash !== null && currentHash !== previousHash && !force) {
      localEdits = true;
      continue;
    }
    const installed = join(destination, path);
    mkdirSync(dirname(installed), { recursive: true });
    cpSync(join(source, path), installed, { force: true });
    changed = true;
  }
  const prefix = `${target}/`;
  for (const [lockedPath, entry] of Object.entries(oldLock.skills)) {
    if (!lockedPath.startsWith(prefix)) continue;
    const path = lockedPath.slice(prefix.length);
    if (sourceFiles.has(path)) continue;
    const currentHash = installedHash(destination, path);
    if (currentHash === entry.sha256) {
      rmSync(join(destination, path), { force: true });
      changed = true;
    } else if (currentHash !== null) localEdits = true;
  }
  return { changed, localEdits };
}

function removeOwnedDiscovery(
  path: string,
  parent: string,
  skill: DiscoverySkill,
  oldLock: SkillsLock,
): { changed: boolean; localEdits: boolean } {
  if (!lstatExists(path)) return { changed: false, localEdits: false };
  const canonical = join(dirname(dirname(parent)), '.claude', 'skills', skill.target);
  const expected = slash(relative(parent, canonical));
  if (lstatSync(path).isSymbolicLink()) {
    if (readlinkSync(path) !== expected) return { changed: false, localEdits: true };
    rmSync(path, { force: true });
    return { changed: true, localEdits: false };
  }
  if (oldLock.linkMode !== 'copy' || !statSync(path).isDirectory()) return { changed: false, localEdits: true };

  const prefix = `${skill.target}/`;
  const owned = new Map(
    Object.entries(oldLock.skills)
      .filter(([lockedPath]) => lockedPath.startsWith(prefix))
      .map(([lockedPath, entry]) => [lockedPath.slice(prefix.length), entry.sha256]),
  );
  let changed = false;
  let localEdits = false;
  for (const [file, hash] of owned) {
    const current = installedHash(path, file);
    if (current === hash) {
      rmSync(join(path, file), { force: true });
      changed = true;
    } else if (current !== null) localEdits = true;
  }
  if (readdirSync(path).length === 0) {
    rmSync(path, { recursive: true, force: true });
    changed = true;
  }
  return { changed, localEdits: localEdits || lstatExists(path) };
}

function installLinks(
  repoDir: string,
  skills: DiscoverySkill[],
  oldLock: SkillsLock | null,
  createLink: CreateLink,
  force: boolean,
): { changed: boolean; usesCopy: boolean; localEdits: string[] } {
  let changed = false;
  let usesCopy = false;
  const localEdits: string[] = [];
  const oldSkills = oldDiscoverySkills(oldLock);
  const owned = new Set(oldSkills.map(({ name }) => name));
  const desired = new Set(skills.map(({ name }) => name));
  for (const parentName of ['.codex', '.agents']) {
    const parent = join(repoDir, parentName, 'skills');
    mkdirSync(parent, { recursive: true });
    if (oldLock) {
      for (const skill of oldSkills.filter(({ name }) => !desired.has(name))) {
        const removed = removeOwnedDiscovery(join(parent, skill.name), parent, skill, oldLock);
        changed ||= removed.changed;
        if (removed.localEdits) localEdits.push(`${parentName}/skills/${skill.name}`);
      }
    }
    for (const skill of skills) {
      const path = join(parent, skill.name);
      const canonical = join(repoDir, '.claude', 'skills', skill.target);
      const expected = slash(relative(parent, canonical));
      const exists = lstatExists(path);
      if (exists && lstatSync(path).isSymbolicLink() && readlinkSync(path) === expected && existsSync(path)) continue;
      if (exists && !lstatSync(path).isSymbolicLink() && oldLock?.linkMode === 'copy') {
        usesCopy = true;
        const refreshed = refreshManagedCopy(canonical, path, skill.target, oldLock, force);
        changed ||= refreshed.changed;
        if (refreshed.localEdits) localEdits.push(`${parentName}/skills/${skill.name}`);
        continue;
      }
      if (exists && !owned.has(skill.name)) continue;
      if (exists) rmSync(path, { recursive: true, force: true });
      try {
        createLink(expected, path);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (!['EACCES', 'EPERM', 'EXDEV', 'ENOSYS'].includes(code ?? '')) throw error;
        cpSync(canonical, path, { recursive: true });
        usesCopy = true;
      }
      changed = true;
    }
  }
  return { changed, usesCopy, localEdits };
}

function groupActions(states: Map<string, FileState>, force: boolean): string[] {
  const actions: string[] = [];
  const groups = new Map<string, Set<FileState>>();
  for (const [path, state] of states) {
    const group = path.split('/')[0];
    const grouped = groups.get(group) ?? new Set<FileState>();
    grouped.add(state);
    groups.set(group, grouped);
    if (state === 'local-edit' && !force) actions.push(`kept local edit ${path}`);
  }
  for (const [group, values] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    if (values.has('missing')) actions.push(`installed ${group}`);
    else if (values.has('outdated') || (force && values.has('local-edit')) || values.has('removed'))
      actions.push(`updated ${group}`);
  }
  return [...new Set(actions)];
}

export function syncSkillPack(options: SyncSkillPackOptions): SyncSkillPackResult {
  const repoDir = resolve(options.repoDir);
  const packDir = resolve(options.packDir);
  if (!existsSync(packDir) || !statSync(packDir).isDirectory()) {
    throw new UsageError(`skill pack not found: ${packDir}`, 'set GM_SKILLS_DIR to the platform skills directory');
  }
  const source = sourcePack(packDir);
  const currentVersion = gmCliVersion();
  const installedRoot = join(repoDir, '.claude', 'skills');
  const oldLock = readSkillsLock(repoDir);
  const states = assessFiles(installedRoot, source.files, oldLock);
  const links = linkDrift(repoDir, source.discovery, oldLock);
  const driftLines = [
    ...[...states]
      .filter(([, state]) => state !== 'clean')
      .map(([path, state]) => `${state.replace('-', ' ')} ${path}`),
    ...links,
    ...(oldLock && oldLock.pack !== currentVersion ? [`pack version ${oldLock.pack} -> ${currentVersion}`] : []),
  ];
  const actions = groupActions(states, options.force === true);
  if (oldLock && oldLock.pack !== currentVersion)
    actions.push(`updated skill pack ${oldLock.pack} -> ${currentVersion}`);
  if (options.checkOnly) return { changed: false, drift: driftLines.length > 0, actions: driftLines, lock: oldLock };

  const filesToWrite = source.files.filter(({ path }) => {
    const state = states.get(path);
    return state === 'missing' || state === 'outdated' || (state === 'local-edit' && options.force === true);
  });
  const filesToRemove = [...states].filter(([, state]) => state === 'removed').map(([path]) => path);
  const filesChanged = filesToWrite.length > 0 || filesToRemove.length > 0;
  if (filesChanged) {
    mkdirSync(dirname(installedRoot), { recursive: true });
    const staging = mkdtempSync(join(dirname(installedRoot), '.gm-skills-stage-'));
    try {
      if (existsSync(installedRoot)) copyContents(installedRoot, staging);
      for (const file of filesToWrite) {
        const destination = join(staging, file.path);
        mkdirSync(dirname(destination), { recursive: true });
        cpSync(file.source, destination, { force: true });
      }
      for (const path of filesToRemove) rmSync(join(staging, path), { force: true });
      replaceDirectory(installedRoot, staging);
    } finally {
      if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    }
  }

  const createLink = options.createLink ?? ((target, path) => symlinkSync(target, path, 'dir'));
  const installedLinks = installLinks(repoDir, source.discovery, oldLock, createLink, options.force === true);
  for (const path of installedLinks.localEdits) actions.push(`kept local edit ${path}`);
  const changed = filesChanged || installedLinks.changed || oldLock === null || oldLock.pack !== currentVersion;
  if (!changed)
    return {
      changed: false,
      drift: driftLines.length > 0 || installedLinks.localEdits.length > 0,
      actions,
      lock: oldLock,
    };

  const localEdits = new Set(
    [...states].filter(([, state]) => state === 'local-edit' && options.force !== true).map(([path]) => path),
  );
  const remainingLinkDrift = linkDrift(repoDir, source.discovery, {
    ...(oldLock ?? { v: 1, pack: currentVersion, installedAt: '', skills: {}, vendored: {} }),
    linkMode: installedLinks.usesCopy ? 'copy' : undefined,
  } as SkillsLock);
  const lock: SkillsLock = {
    v: 1,
    pack: currentVersion,
    installedAt: new Date().toISOString(),
    skills: Object.fromEntries(
      source.files.map((file) => [
        file.path,
        { sha256: localEdits.has(file.path) ? (oldLock?.skills[file.path]?.sha256 ?? file.sha256) : file.sha256 },
      ]),
    ),
    vendored: readVendorPins(packDir),
    ...(installedLinks.usesCopy ? { linkMode: 'copy' as const } : {}),
  };
  writeSkillsLock(repoDir, lock);
  return { changed: true, drift: localEdits.size > 0 || remainingLinkDrift.length > 0, actions, lock };
}

export function installedSkills(repoDir: string): Array<{ name: string; version: string }> {
  const lock = readSkillsLock(repoDir);
  if (!lock) return [];
  const rows = new Map<string, string>();
  for (const path of Object.keys(lock.skills).filter((candidate) => candidate.endsWith('/SKILL.md'))) {
    const target = path.slice(0, -'/SKILL.md'.length);
    const vendor = target.startsWith('vendor/');
    const name = vendor ? target.split('/').at(-1) : target;
    if (name) rows.set(name, vendor ? 'vendored' : lock.pack);
  }
  return [...rows].sort(([a], [b]) => a.localeCompare(b)).map(([name, version]) => ({ name, version }));
}
