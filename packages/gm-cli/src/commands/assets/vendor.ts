import { copyFile, lstat, mkdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

import type { AssetsLock, LockEntry } from '@ogm/contracts';

import { EXIT, UsageError, type GmCommand } from '../../command.js';
import { resolveContainedPath } from '../../context.js';
import { readLock, sha256File, writeLock } from '../../lock.js';
import { entrySource, repoPaths, resolveEntry, type Locations, type ResolvedFile } from '../../resolve.js';

type Refusal = { id: string; rule: string; detail: string; fix: string };
type PlannedFile = ResolvedFile & { destination: string; repoPath: string };
type VendorPlan = { entry: LockEntry; files: PlannedFile[] };
type DestinationResult = { ok: true; file: PlannedFile } | { ok: false; refusal: Refusal };
type PlanResult = { ok: true; plan: VendorPlan } | { ok: false; refusal: Refusal };

function refusalLine(refusal: Refusal): string {
  return `${refusal.id}  ${refusal.rule}  ${refusal.detail}. Try: ${refusal.fix}`;
}

function collectionSlug(id: string): string {
  return id.slice(id.indexOf(':') + 1, id.indexOf('/'));
}

/** Keep each source tree intact and isolate equal pack paths under their collection slug. */
function vendorPath(entry: LockEntry, path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/^assets\//u, '');
  return join('assets', collectionSlug(entry.id), normalized).replaceAll(sep, '/');
}

async function ensureRepoDirectory(cwd: string, repoPath: string): Promise<boolean> {
  let current = cwd;
  for (const part of dirname(repoPath).replaceAll('\\', '/').split('/').filter(Boolean)) {
    current = join(current, part);
    try {
      const found = await lstat(current);
      if (found.isSymbolicLink() || !found.isDirectory()) return false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await mkdir(current);
    }
  }
  return (await resolveContainedPath(cwd, current)) !== null;
}

async function destinationRefusal(
  cwd: string,
  entry: LockEntry,
  file: ResolvedFile,
  held: Map<string, string>,
): Promise<DestinationResult> {
  const repoPath = vendorPath(entry, file.path);
  const heldBy = held.get(repoPath);
  if (heldBy !== undefined && heldBy !== entry.id) {
    return {
      ok: false,
      refusal: {
        id: entry.id,
        rule: 'name-collision',
        detail: `${repoPath} is already owned by ${heldBy}`,
        fix: `gm assets why ${entry.id}`,
      },
    };
  }

  const destination = resolve(cwd, repoPath);
  if (!(await ensureRepoDirectory(cwd, repoPath))) {
    return {
      ok: false,
      refusal: {
        id: entry.id,
        rule: 'unsafe-destination',
        detail: `${repoPath} resolves outside the game repo`,
        fix: 'replace the assets path with a real directory',
      },
    };
  }

  try {
    const current = await lstat(destination);
    if (current.isSymbolicLink() || !current.isFile() || (await sha256File(destination)) !== file.sha256) {
      return {
        ok: false,
        refusal: {
          id: entry.id,
          rule: 'name-collision',
          detail: `${repoPath} already contains different bytes or is not a regular file`,
          fix: `move that path, then retry gm assets vendor ${entry.id}`,
        },
      };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  return { ok: true, file: { ...file, destination, repoPath } };
}

function vendoredEntry(entry: LockEntry, files: PlannedFile[]): LockEntry {
  const [primary, ...companions] = files;
  return {
    ...entry,
    path: primary!.repoPath,
    sha256: primary!.sha256,
    source: 'vendored',
    ...(companions.length === 0
      ? { files: undefined }
      : { files: companions.map((file) => ({ path: file.repoPath, sha256: file.sha256 })) }),
  };
}

async function planEntry(entry: LockEntry, locations: Locations, held: Map<string, string>): Promise<PlanResult> {
  if (entry.rights.redistribution !== 'free') {
    return {
      ok: false,
      refusal: {
        id: entry.id,
        rule: 'no-redistribution',
        detail: `effective rights are ${entry.rights.redistribution}, so the files cannot be vendored into the repo`,
        fix: `gm assets why ${entry.id}`,
      },
    };
  }

  const resolution = await resolveEntry(entry, locations);
  if (!resolution.ok) {
    return {
      ok: false,
      refusal: {
        id: entry.id,
        rule: resolution.rule,
        detail: resolution.detail,
        fix: resolution.fix,
      },
    };
  }
  if (entrySource(entry) === 'vendored') return { ok: true, plan: { entry, files: [] } };

  const files: PlannedFile[] = [];
  const ownPaths = new Set<string>();
  for (const resolved of resolution.files) {
    const target = await destinationRefusal(locations.cwd, entry, resolved, held);
    if (!target.ok) return target;
    if (ownPaths.has(target.file.repoPath)) {
      return {
        ok: false,
        refusal: {
          id: entry.id,
          rule: 'name-collision',
          detail: `${target.file.repoPath} would hold more than one source file`,
          fix: `gm assets why ${entry.id}`,
        },
      };
    }
    ownPaths.add(target.file.repoPath);
    files.push(target.file);
  }
  return { ok: true, plan: { entry, files } };
}

async function applyPlans(cwd: string, lock: AssetsLock, plans: VendorPlan[]): Promise<AssetsLock> {
  const replacements = new Map<string, LockEntry>();
  for (const plan of plans) {
    if (plan.files.length === 0) continue;
    for (const file of plan.files) {
      await copyFile(file.absolute, file.destination);
      if ((await sha256File(file.destination)) !== file.sha256) {
        throw new Error(`copied asset failed sha256 verification: ${relative(cwd, file.destination)}`);
      }
    }
    replacements.set(plan.entry.id, vendoredEntry(plan.entry, plan.files));
  }
  return replacements.size === 0
    ? lock
    : { ...lock, assets: lock.assets.map((entry) => replacements.get(entry.id) ?? entry) };
}

export const command: GmCommand = {
  name: 'assets vendor',
  summary: 'copy redistributable locked assets into this game repo',
  usage: '<id...>',
  example: 'assets vendor t1:kenney-mini-dungeon/character-orc@2.0',
  flags: {},
  async run(ctx, args) {
    const ids = [...new Set(args)];
    if (ids.length === 0) throw new UsageError('no asset id given', 'gm assets vendor <id...>');
    const lock = await readLock(ctx.cwd);
    if (lock === null) throw new UsageError('assets.lock.json not found', 'gm assets use <id>');

    const byId = new Map(lock.assets.map((entry) => [entry.id, entry]));
    const held = new Map<string, string>(
      lock.assets.flatMap((entry) => repoPaths(entry).map((path) => [path.replaceAll('\\', '/'), entry.id] as const)),
    );
    const locations: Locations = { cwd: ctx.cwd, assetsRoot: ctx.assetsRoot, blobRoot: ctx.blobRoot };
    const plans: VendorPlan[] = [];
    const refusals: Refusal[] = [];
    for (const id of ids) {
      const entry = byId.get(id);
      if (entry === undefined) {
        refusals.push({
          id,
          rule: 'unknown-id',
          detail: 'asset is not present in assets.lock.json',
          fix: `gm assets use ${id}`,
        });
        continue;
      }
      const planned = await planEntry(entry, locations, held);
      if (!planned.ok) refusals.push(planned.refusal);
      else {
        plans.push(planned.plan);
        for (const file of planned.plan.files) held.set(file.repoPath, entry.id);
      }
    }

    const updated = await applyPlans(ctx.cwd, lock, plans);
    if (updated !== lock) await writeLock(ctx.cwd, updated);
    refusals.forEach((refusal) => ctx.err(refusalLine(refusal)));
    ctx.emit('assets.vendor', { ids, vendored: plans.length, refused: refusals.length });
    return refusals.length === 0 ? EXIT.ok : EXIT.usage;
  },
};
