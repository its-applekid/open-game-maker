import { cp, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join } from 'node:path';

import type { Manifest, WorkspacePackage } from './graph.js';
import { ReleaseError } from './graph.js';
import type { RegistryProfile } from './profile.js';
import type { RunCommand } from './run.js';

const DEPENDENCY_SECTIONS = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const;
const WORKSPACE_PROTOCOL = 'workspace:';

export type PublishedManifest = {
  readonly manifest: Manifest;
  /** Top-level paths the tarball carries, relative to the package root. */
  readonly files: readonly string[];
};

function stringLeaves(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringLeaves);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(stringLeaves);
  return [];
}

/** Top-level directories or files a manifest's public surface points at (`exports`, `bin`, `types`, `main`). */
export function exportedPaths(manifest: Manifest): string[] {
  const paths = new Set<string>();
  const surfaces: unknown[] = [manifest.exports, manifest.bin, manifest.types, manifest.main];
  for (const surface of surfaces) {
    for (const leaf of stringLeaves(surface)) {
      const segments = leaf.replace(/^\.\//, '').split('/');
      const top = segments[0];
      if (top !== undefined && top !== '' && top !== '.' && !top.includes('*')) paths.add(top);
    }
  }
  return [...paths].sort();
}

/**
 * The specifier a consumer installs for an internal dependency. The dependency key stays the source
 * name (`@gm/sdk`), so the import specifiers in the published code keep working; when the destination
 * registry needs another scope the value becomes an `npm:` alias to the published name.
 */
export function internalSpecifier(
  dependency: string,
  names: ReadonlyMap<string, string>,
  versions: ReadonlyMap<string, string>,
): string {
  const version = versions.get(dependency);
  if (version === undefined) {
    throw new ReleaseError(`${dependency} is a workspace dependency but not part of the release closure`);
  }
  const destination = names.get(dependency);
  if (destination === undefined) {
    throw new ReleaseError(`${dependency} has no destination name`);
  }
  return destination === dependency ? version : `npm:${destination}@${version}`;
}

/**
 * The manifest that goes into the tarball: destination name, immutable version, internal dependencies
 * rewritten to published specifiers, `private` and `scripts` dropped so an install never runs this
 * repository's build steps.
 */
export function publishedManifest(args: {
  pkg: WorkspacePackage;
  profile: RegistryProfile;
  names: ReadonlyMap<string, string>;
  versions: ReadonlyMap<string, string>;
}): PublishedManifest {
  const { pkg, profile, names, versions } = args;
  const name = names.get(pkg.name);
  const version = versions.get(pkg.name);
  if (name === undefined || version === undefined) {
    throw new ReleaseError(`${pkg.name} is not in the release plan`);
  }

  const manifest: Record<string, unknown> = { ...pkg.manifest, name, version };
  delete manifest.private;
  delete manifest.scripts;
  manifest.publishConfig = {
    registry: profile.registry,
    access: profile.access,
    tag: profile.tag,
  };

  for (const section of DEPENDENCY_SECTIONS) {
    const block = manifest[section];
    if (typeof block !== 'object' || block === null || Array.isArray(block)) continue;
    const rewritten: Record<string, string> = {};
    for (const [dependency, spec] of Object.entries(block as Record<string, string>)) {
      rewritten[dependency] = spec.startsWith(WORKSPACE_PROTOCOL)
        ? internalSpecifier(dependency, names, versions)
        : spec;
    }
    manifest[section] = rewritten;
  }

  const devDependencies = manifest.devDependencies;
  if (typeof devDependencies === 'object' && devDependencies !== null && !Array.isArray(devDependencies)) {
    const kept: Record<string, string> = {};
    for (const [dependency, spec] of Object.entries(devDependencies as Record<string, string>)) {
      if (!spec.startsWith(WORKSPACE_PROTOCOL)) kept[dependency] = spec;
    }
    if (Object.keys(kept).length > 0) manifest.devDependencies = kept;
    else delete manifest.devDependencies;
  }

  const files = exportedPaths(pkg.manifest);
  if (!files.includes('dist')) {
    throw new ReleaseError(`${pkg.name} does not expose a dist directory in its manifest; nothing to publish`);
  }
  manifest.files = files;
  return { manifest: manifest as Manifest, files };
}

export type StagedPackage = {
  readonly source: WorkspacePackage;
  readonly name: string;
  readonly version: string;
  readonly dir: string;
  readonly files: readonly string[];
  readonly manifest: Manifest;
};

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copies the published surface into a staging directory and writes the rewritten manifest there.
 * The workspace build must have run first: a missing `dist` fails closed rather than publishing an
 * empty package.
 */
export async function stagePackage(args: {
  pkg: WorkspacePackage;
  profile: RegistryProfile;
  names: ReadonlyMap<string, string>;
  versions: ReadonlyMap<string, string>;
  stagingRoot: string;
}): Promise<StagedPackage> {
  const { pkg, profile, names, versions, stagingRoot } = args;
  const { manifest, files } = publishedManifest({ pkg, profile, names, versions });
  const dir = join(stagingRoot, pkg.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
  await mkdir(dir, { recursive: true });

  for (const file of files) {
    const from = join(pkg.dir, file);
    if (!(await exists(from))) {
      throw new ReleaseError(`${pkg.name}: ${file} is missing — run the workspace build before publishing`);
    }
    await cp(from, join(dir, file), { recursive: true });
  }
  for (const doc of ['README.md', 'LICENSE', 'LICENSE.md']) {
    if (await exists(join(pkg.dir, doc))) await cp(join(pkg.dir, doc), join(dir, doc));
  }

  await writeFile(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const name = manifest.name;
  const version = manifest.version;
  if (typeof name !== 'string' || typeof version !== 'string') {
    throw new ReleaseError(`${pkg.name}: staged manifest lost its name or version`);
  }
  return { source: pkg, name, version, dir, files, manifest };
}

/** Packs a staged directory and returns the tarball's absolute path. */
export async function packTarball(args: { dir: string; outDir: string; run: RunCommand }): Promise<string> {
  const { dir, outDir, run } = args;
  await mkdir(outDir, { recursive: true });
  const result = await run('pnpm', ['pack', '--pack-destination', outDir], { cwd: dir, env: {} });
  if (result.code !== 0) {
    throw new ReleaseError(`pnpm pack failed in ${dir} (exit ${result.code}): ${result.stderr.trim().slice(0, 400)}`);
  }
  const printed = result.stdout
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.endsWith('.tgz'))
    .pop();
  if (printed !== undefined && printed !== '') return isAbsolute(printed) ? printed : join(outDir, basename(printed));

  const tarballs = (await readdir(outDir)).filter((entry) => entry.endsWith('.tgz'));
  if (tarballs.length === 0) throw new ReleaseError(`pnpm pack printed no tarball for ${dir}`);
  tarballs.sort();
  return join(outDir, tarballs[tarballs.length - 1] as string);
}
