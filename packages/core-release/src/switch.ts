import { readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import { unifiedDiff } from './diff.js';
import { ReleaseError } from './graph.js';
import type { RegistryProfile } from './profile.js';
import { destinationName, npmrcLines } from './profile.js';
import { readCorePin } from './version.js';

const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;
const MANAGED_START = '# >>> core packages registry — managed by core-release switch';
const MANAGED_END = '# <<< core packages registry';
const LOCAL_PROTOCOLS = ['file:', 'workspace:'];

export type SwitchPlanInput = {
  /** The instance repository checkout to switch. Nothing is written while planning. */
  readonly dir: string;
  readonly profile: RegistryProfile;
  /** Source package name → published version, from the release plan. */
  readonly versions: ReadonlyMap<string, string>;
  /** Core commit the versions come from; must match the instance repository's pin. */
  readonly coreSha: string;
};

export type ManifestEdit = {
  readonly manifest: string;
  readonly dependency: string;
  readonly from: string;
  readonly to: string;
};

export type SwitchPlan = {
  readonly dir: string;
  readonly pin: string;
  readonly edits: readonly { readonly path: string; readonly before: string; readonly after: string }[];
  readonly dependencies: readonly ManifestEdit[];
  readonly deletions: readonly string[];
  readonly npmrc: { readonly path: string; readonly before: string; readonly after: string; readonly created: boolean };
  readonly notes: readonly string[];
  readonly diff: string;
};

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

async function manifestPaths(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const group of ['games', 'packages']) {
    const groupDir = join(dir, group);
    let entries: string[];
    try {
      entries = (await readdir(groupDir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(groupDir, entry, 'package.json');
      if ((await stat(path).catch(() => null)) !== null) found.push(path);
    }
  }
  return found;
}

function rewrittenManifest(
  text: string,
  path: string,
  args: { profile: RegistryProfile; versions: ReadonlyMap<string, string>; dir: string },
): { after: string; edits: ManifestEdit[]; tarballs: string[] } {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ReleaseError(`${relative(args.dir, path)} is not a JSON object`);
  }
  const manifest = parsed as Record<string, unknown>;
  const edits: ManifestEdit[] = [];
  const tarballs: string[] = [];

  for (const section of DEPENDENCY_SECTIONS) {
    const block = manifest[section];
    if (typeof block !== 'object' || block === null || Array.isArray(block)) continue;
    const dependencies = block as Record<string, string>;
    for (const [dependency, spec] of Object.entries(dependencies)) {
      const version = args.versions.get(dependency);
      if (version === undefined || typeof spec !== 'string') continue;
      if (!LOCAL_PROTOCOLS.some((protocol) => spec.startsWith(protocol))) continue;

      if (spec.startsWith('file:')) {
        const file = resolve(path, '..', spec.slice('file:'.length));
        if (file.endsWith('.tgz') && file.startsWith(`${args.dir}${sep}`)) tarballs.push(file);
      }
      const destination = destinationName(dependency, args.profile);
      const next = destination === dependency ? version : `npm:${destination}@${version}`;
      dependencies[dependency] = next;
      edits.push({ manifest: relative(args.dir, path), dependency, from: spec, to: next });
    }
  }

  if (edits.length === 0) return { after: text, edits, tarballs };
  return { after: `${JSON.stringify(manifest, null, 2)}\n`, edits, tarballs };
}

function mergedNpmrc(
  before: string | null,
  profile: RegistryProfile,
): { after: string; created: boolean; notes: string[] } {
  const notes: string[] = [];
  const block = [MANAGED_START, ...npmrcLines(profile), MANAGED_END];
  const original = before ?? '';
  const kept: string[] = [];
  let insideManaged = false;
  for (const line of original.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === MANAGED_START) {
      insideManaged = true;
      continue;
    }
    if (trimmed === MANAGED_END) {
      insideManaged = false;
      continue;
    }
    if (insideManaged) continue;
    if (/^offline\s*=\s*true$/i.test(trimmed)) {
      kept.push('# offline=true disabled: core packages install from the registry');
      notes.push('.npmrc had offline=true; commented it out so registry installs resolve');
      continue;
    }
    kept.push(line);
  }

  while (kept.length > 0 && (kept[kept.length - 1] ?? '').trim() === '') kept.pop();
  const head = kept.length > 0 ? `${kept.join('\n')}\n\n` : '';
  return { after: `${head}${block.join('\n')}\n`, created: before === null, notes };
}

/**
 * Plans the one-pull-request switch of an instance repository from vendored core tarballs to registry
 * versions. Reads only; `applySwitch` writes. Every core dependency declared with `file:` or
 * `workspace:` becomes the published version, keyed by its source name so imports do not change.
 */
export async function planSwitch(input: SwitchPlanInput): Promise<SwitchPlan> {
  const { dir, profile, versions, coreSha } = input;
  const pinText = await readText(join(dir, 'vendor', 'core.json'));
  if (pinText === null) throw new ReleaseError(`${dir} has no vendor/core.json; nothing to switch`);
  const read = readCorePin(pinText);
  if (!read.ok) throw new ReleaseError(read.reason);
  if (read.pin.sha !== coreSha.toLowerCase()) {
    throw new ReleaseError(
      `the instance repository pins ${read.pin.sha.slice(0, 12)} but the release versions come from ${coreSha.slice(0, 12)}`,
    );
  }

  const edits: { path: string; before: string; after: string }[] = [];
  const dependencies: ManifestEdit[] = [];
  const tarballPaths = new Set<string>();
  const notes: string[] = [];

  for (const path of await manifestPaths(dir)) {
    const before = await readText(path);
    if (before === null) continue;
    const rewritten = rewrittenManifest(before, path, { profile, versions, dir });
    if (rewritten.after === before) continue;
    edits.push({ path: relative(dir, path), before, after: rewritten.after });
    dependencies.push(...rewritten.edits);
    for (const tarball of rewritten.tarballs) tarballPaths.add(tarball);
  }

  const npmrcPath = join(dir, '.npmrc');
  const npmrcBefore = await readText(npmrcPath);
  const npmrc = mergedNpmrc(npmrcBefore, profile);
  notes.push(...npmrc.notes);

  const deletions: string[] = [];
  for (const tarball of [...tarballPaths].sort()) {
    const exists = (await stat(tarball).catch(() => null)) !== null;
    deletions.push(relative(dir, tarball));
    if (!exists) notes.push(`${relative(dir, tarball)} was already absent`);
  }
  if (dependencies.length === 0 && npmrc.after === (npmrcBefore ?? '')) {
    notes.push('nothing to switch: no core dependency uses a local protocol and .npmrc already names the registry');
  }

  const diffs = edits.map((edit) => unifiedDiff(edit.before, edit.after, { path: edit.path }));
  diffs.push(unifiedDiff(npmrcBefore ?? '', npmrc.after, { path: '.npmrc' }));

  return {
    dir,
    pin: read.pin.sha,
    edits,
    dependencies,
    deletions,
    npmrc: { path: '.npmrc', before: npmrcBefore ?? '', after: npmrc.after, created: npmrc.created },
    notes,
    diff: diffs.filter((entry) => entry !== '').join(''),
  };
}

/** Writes the plan: rewritten manifests, the managed `.npmrc` block, and the now-unreferenced tarballs removed. */
export async function applySwitch(plan: SwitchPlan): Promise<void> {
  for (const edit of plan.edits) await writeFile(join(plan.dir, edit.path), edit.after, 'utf8');
  await writeFile(join(plan.dir, plan.npmrc.path), plan.npmrc.after, 'utf8');
  for (const deletion of plan.deletions) {
    const target = join(plan.dir, deletion);
    if (!target.startsWith(`${plan.dir}${sep}`))
      throw new ReleaseError(`refusing to delete ${deletion} outside ${plan.dir}`);
    await rm(target, { force: true });
  }
}
