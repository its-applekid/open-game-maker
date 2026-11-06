import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { unifiedDiff } from './diff.js';
import { ReleaseError } from './graph.js';
import type { RegistryProfile } from './profile.js';
import { npmrcLines } from './profile.js';
import { CORE_RELEASE_SET_PATH, coreReleaseSetText, releasedSpecifier } from './release-set.js';
import { readCorePin } from './version.js';

const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;
export const MANAGED_START = '# >>> core packages registry — managed by core-release switch';
export const MANAGED_END = '# <<< core packages registry';
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
  /** `vendor/core-packages.json`: the released version set `gm new` resolves from. */
  readonly releaseSet: {
    readonly path: string;
    readonly before: string;
    readonly after: string;
    readonly created: boolean;
  };
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

/**
 * Every manifest a switch may rewrite: the repository's own `package.json` (a standalone game
 * repository keeps its game there) plus one level under `games/` and `packages/`.
 */
export async function manifestPaths(dir: string): Promise<string[]> {
  const found: string[] = [];
  const root = join(dir, 'package.json');
  if ((await stat(root).catch(() => null)) !== null) found.push(root);
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
): { after: string; edits: ManifestEdit[]; tarballs: string[]; local: string[] } {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ReleaseError(`${relative(args.dir, path)} is not a JSON object`);
  }
  const manifest = parsed as Record<string, unknown>;
  const edits: ManifestEdit[] = [];
  const tarballs: string[] = [];
  const local: string[] = [];

  for (const section of DEPENDENCY_SECTIONS) {
    const block = manifest[section];
    if (typeof block !== 'object' || block === null || Array.isArray(block)) continue;
    const dependencies = block as Record<string, string>;
    for (const [dependency, spec] of Object.entries(dependencies)) {
      const version = args.versions.get(dependency);
      if (typeof spec !== 'string') continue;
      const file = spec.startsWith('file:') ? resolve(path, '..', spec.slice('file:'.length)) : null;
      const localTarball = file !== null && file.endsWith('.tgz') && file.startsWith(`${args.dir}${sep}`);
      if (version === undefined || !LOCAL_PROTOCOLS.some((protocol) => spec.startsWith(protocol))) {
        // A tarball another dependency still points at stays on disk.
        if (localTarball) local.push(file);
        continue;
      }
      if (localTarball) tarballs.push(file);
      const next = releasedSpecifier(dependency, version, args.profile);
      dependencies[dependency] = next;
      edits.push({ manifest: relative(args.dir, path), dependency, from: spec, to: next });
    }
  }

  if (edits.length === 0) return { after: text, edits, tarballs, local };
  return { after: `${JSON.stringify(manifest, null, 2)}\n`, edits, tarballs, local };
}

function mergedNpmrc(
  before: string | null,
  profile: RegistryProfile,
): { after: string; created: boolean; notes: string[] } {
  const notes: string[] = [];
  // A public release needs no credential, so its block is only the scoped registry. A restricted
  // destination gets the token variable reference too; pnpm refuses to substitute an unset variable and
  // then skips the rest of the file, including the scoped registry line.
  const lines =
    profile.access === 'restricted' ? npmrcLines(profile) : [`${profile.scope}:registry=${profile.registry}`];
  const block = [MANAGED_START, ...lines, MANAGED_END];
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
 * `workspace:` becomes the published version, keyed by its source name so imports do not change, and
 * `vendor/core-packages.json` records the version set so `gm new` can resolve it without the core
 * checkout. A standalone game repository with no `vendor/core.json` may switch on an explicit
 * `--core-sha`.
 */
export async function planSwitch(input: SwitchPlanInput): Promise<SwitchPlan> {
  const { dir, profile, versions, coreSha } = input;
  const notes: string[] = [];
  const pinText = await readText(join(dir, 'vendor', 'core.json'));
  let pin = coreSha.toLowerCase();
  if (pinText === null) {
    notes.push(`no vendor/core.json: ${CORE_RELEASE_SET_PATH} records the core commit ${pin.slice(0, 12)} instead`);
  } else {
    const read = readCorePin(pinText);
    if (!read.ok) throw new ReleaseError(read.reason);
    if (read.pin.sha !== pin) {
      throw new ReleaseError(
        `the repository pins ${read.pin.sha.slice(0, 12)} but the release versions come from ${coreSha.slice(0, 12)}`,
      );
    }
    pin = read.pin.sha;
  }

  const edits: { path: string; before: string; after: string }[] = [];
  const dependencies: ManifestEdit[] = [];
  const tarballPaths = new Set<string>();
  const stillReferenced = new Set<string>();

  for (const path of await manifestPaths(dir)) {
    const before = await readText(path);
    if (before === null) continue;
    const rewritten = rewrittenManifest(before, path, { profile, versions, dir });
    for (const tarball of rewritten.local) stillReferenced.add(tarball);
    if (rewritten.after === before) continue;
    edits.push({ path: relative(dir, path), before, after: rewritten.after });
    dependencies.push(...rewritten.edits);
    for (const tarball of rewritten.tarballs) tarballPaths.add(tarball);
  }

  const npmrcPath = join(dir, '.npmrc');
  const npmrcBefore = await readText(npmrcPath);
  const npmrc = mergedNpmrc(npmrcBefore, profile);
  notes.push(...npmrc.notes);

  const releaseSetPath = join(dir, CORE_RELEASE_SET_PATH);
  const releaseSetBefore = await readText(releaseSetPath);
  const releaseSetAfter = coreReleaseSetText({ sha: pin, profile, versions });

  const deletions: string[] = [];
  for (const tarball of [...tarballPaths].sort()) {
    if (stillReferenced.has(tarball)) {
      notes.push(`${relative(dir, tarball)} is still referenced by another dependency; kept`);
      continue;
    }
    const exists = (await stat(tarball).catch(() => null)) !== null;
    deletions.push(relative(dir, tarball));
    if (!exists) notes.push(`${relative(dir, tarball)} was already absent`);
  }
  if (dependencies.length === 0 && npmrc.after === (npmrcBefore ?? '') && releaseSetBefore === releaseSetAfter) {
    notes.push('nothing to switch: no core dependency uses a local protocol and .npmrc already names the registry');
  }

  const diffs = edits.map((edit) => unifiedDiff(edit.before, edit.after, { path: edit.path }));
  diffs.push(unifiedDiff(npmrcBefore ?? '', npmrc.after, { path: '.npmrc' }));
  diffs.push(unifiedDiff(releaseSetBefore ?? '', releaseSetAfter, { path: CORE_RELEASE_SET_PATH }));

  return {
    dir,
    pin,
    edits,
    dependencies,
    deletions,
    npmrc: { path: '.npmrc', before: npmrcBefore ?? '', after: npmrc.after, created: npmrc.created },
    releaseSet: {
      path: CORE_RELEASE_SET_PATH,
      before: releaseSetBefore ?? '',
      after: releaseSetAfter,
      created: releaseSetBefore === null,
    },
    notes,
    diff: diffs.filter((entry) => entry !== '').join(''),
  };
}

/** Writes the plan: rewritten manifests, the managed `.npmrc` block, the version set, and the now-unreferenced tarballs removed. */
export async function applySwitch(plan: SwitchPlan): Promise<void> {
  for (const edit of plan.edits) await writeFile(join(plan.dir, edit.path), edit.after, 'utf8');
  await writeFile(join(plan.dir, plan.npmrc.path), plan.npmrc.after, 'utf8');
  const setPath = join(plan.dir, plan.releaseSet.path);
  await mkdir(dirname(setPath), { recursive: true });
  await writeFile(setPath, plan.releaseSet.after, 'utf8');
  for (const deletion of plan.deletions) {
    const target = join(plan.dir, deletion);
    if (!target.startsWith(`${plan.dir}${sep}`))
      throw new ReleaseError(`refusing to delete ${deletion} outside ${plan.dir}`);
    await rm(target, { force: true });
  }
}
