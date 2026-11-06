import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { RunCommand } from './run.js';

/** A `package.json` as much as the release tooling needs to read it. */
export type Manifest = {
  readonly name: string;
  readonly version: string;
  readonly private?: boolean;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta?: Readonly<Record<string, { readonly optional?: boolean }>>;
  readonly exports?: unknown;
  readonly bin?: string | Readonly<Record<string, string>>;
  readonly types?: string;
  readonly main?: string;
  readonly files?: readonly string[];
  readonly scripts?: Readonly<Record<string, string>>;
  readonly [field: string]: unknown;
};

export type WorkspacePackage = {
  readonly name: string;
  readonly version: string;
  /** Absolute directory holding the package's `package.json`. */
  readonly dir: string;
  readonly manifest: Manifest;
  /** Dependencies the manifest declares with the `workspace:` protocol, sorted. */
  readonly workspaceDependencies: readonly string[];
};

export type Workspace = {
  readonly root: string;
  readonly packages: ReadonlyMap<string, WorkspacePackage>;
};

/** A refusal the release tooling raises when the workspace or the plan is not safe to release. */
export class ReleaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleaseError';
  }
}

const WORKSPACE_PROTOCOL = 'workspace:';

const DEPENDENCY_SECTIONS = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const;

export function workspaceDependencies(manifest: Manifest): string[] {
  const names = new Set<string>();
  for (const section of DEPENDENCY_SECTIONS) {
    const block = manifest[section];
    if (block === undefined) continue;
    for (const [name, spec] of Object.entries(block)) {
      if (typeof spec === 'string' && spec.startsWith(WORKSPACE_PROTOCOL)) names.add(name);
    }
  }
  return [...names].sort();
}

/** Builds the graph from already-read manifests. Paths are absolute. */
export function buildWorkspace(root: string, entries: readonly { dir: string; manifest: Manifest }[]): Workspace {
  const packages = new Map<string, WorkspacePackage>();
  for (const entry of entries) {
    const name = entry.manifest.name;
    if (typeof name !== 'string' || name === '') {
      throw new ReleaseError(`package.json in ${entry.dir} has no name`);
    }
    const existing = packages.get(name);
    if (existing !== undefined) {
      throw new ReleaseError(`duplicate package name ${name} in the workspace (${existing.dir} and ${entry.dir})`);
    }
    packages.set(name, {
      name,
      version: typeof entry.manifest.version === 'string' ? entry.manifest.version : '0.0.0',
      dir: entry.dir,
      manifest: entry.manifest,
      workspaceDependencies: workspaceDependencies(entry.manifest),
    });
  }
  return { root, packages };
}

type PnpmListEntry = { readonly name?: unknown; readonly path?: unknown; readonly version?: unknown };

/**
 * Reads the workspace through pnpm's own resolver, so the release list follows the same globs and
 * exclusions the install does. `pnpm -r list --depth -1 --json` prints one entry per workspace project.
 */
export async function loadWorkspace(root: string, run: RunCommand): Promise<Workspace> {
  const result = await run('pnpm', ['-r', 'list', '--depth', '-1', '--json'], { cwd: root, env: {} });
  if (result.code !== 0) {
    throw new ReleaseError(`pnpm -r list failed (exit ${result.code}): ${result.stderr.trim().slice(0, 400)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new ReleaseError('pnpm -r list --json did not print JSON');
  }
  if (!Array.isArray(parsed)) throw new ReleaseError('pnpm -r list --json did not print an array');

  const entries: { dir: string; manifest: Manifest }[] = [];
  for (const raw of parsed as PnpmListEntry[]) {
    if (typeof raw?.path !== 'string' || raw.path === '') continue;
    const text = await readFile(join(raw.path, 'package.json'), 'utf8');
    entries.push({ dir: raw.path, manifest: JSON.parse(text) as Manifest });
  }
  return buildWorkspace(root, entries);
}

/**
 * The exact dependency closure of `roots`, leaves first. Consumers only publish after the packages
 * they import, so the order is the publish order and the reverse is the safe order to unpublish.
 */
export function releaseOrder(workspace: Workspace, roots: readonly string[]): WorkspacePackage[] {
  const sortedRoots = [...new Set(roots)].sort();
  for (const name of sortedRoots) {
    if (!workspace.packages.has(name)) {
      throw new ReleaseError(`core release root ${name} is not a workspace package`);
    }
  }

  const order: WorkspacePackage[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const trail: string[] = [];

  const visit = (name: string, requiredBy: string): void => {
    if (done.has(name)) return;
    if (visiting.has(name)) {
      const cycle = [...trail.slice(trail.indexOf(name)), name];
      throw new ReleaseError(`workspace dependency cycle: ${cycle.join(' -> ')}`);
    }
    const pkg = workspace.packages.get(name);
    if (pkg === undefined) {
      throw new ReleaseError(`${requiredBy} declares workspace dependency ${name}, which is not in the workspace`);
    }
    visiting.add(name);
    trail.push(name);
    for (const dependency of pkg.workspaceDependencies) visit(dependency, name);
    trail.pop();
    visiting.delete(name);
    done.add(name);
    order.push(pkg);
  };

  for (const name of sortedRoots) visit(name, 'core release roots');
  return order;
}

/** The closure as a name → package map, in publish order. */
export function releaseSet(workspace: Workspace, roots: readonly string[]): Map<string, WorkspacePackage> {
  const set = new Map<string, WorkspacePackage>();
  for (const pkg of releaseOrder(workspace, roots)) set.set(pkg.name, pkg);
  return set;
}
