import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { UsageError } from './command.js';

/**
 * The released core version set an instance repository keeps in `vendor/core-packages.json`
 * (`core-release switch --apply` writes it). Source package name → the exact registry specifier a
 * game installs, e.g. `"@gm/sdk": "npm:@open-game-maker/sdk@0.0.0-core.3cef9ec65caa"`.
 *
 * The core repository's templates keep `workspace:*` so its own tests link the core sources; the
 * released specifier replaces the workspace link when a game is scaffolded into an instance
 * repository, because that repository has no core checkout to link to.
 */
export const CORE_RELEASE_SET_PATH = 'vendor/core-packages.json';

export type CoreReleaseSet = {
  readonly sha: string;
  readonly registry: string;
  readonly scope: string;
  readonly packages: Readonly<Record<string, string>>;
};

const COMMIT = /^[0-9a-f]{40}$/i;
const LOCAL_PROTOCOL = /^(?:file|workspace|link):/;
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;
const VERSION = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?`;
/** An exact version, or an `npm:` alias to one: the only two specifier shapes a game may install from. */
const SPECIFIER = new RegExp(`^(?:${VERSION}|npm:(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*@${VERSION})$`);

export type CoreResolution = {
  /** The set the specifiers came from, when one was read. */
  readonly set: CoreReleaseSet | null;
  /** Source name → specifier the game now declares. */
  readonly resolved: Readonly<Record<string, string>>;
  /** Core dependencies the template declares that the set does not list. */
  readonly missing: readonly string[];
};

/** Reads the set without writing. A malformed set is a refusal, never a partial read. */
export async function readCoreReleaseSet(instanceRoot: string): Promise<CoreReleaseSet | null> {
  const path = join(instanceRoot, CORE_RELEASE_SET_PATH);
  if (!existsSync(path)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new UsageError(
      `${CORE_RELEASE_SET_PATH} is not JSON`,
      'regenerate it with core-release switch --apply from the core checkout',
    );
  }
  const core = (parsed as { core?: unknown } | null)?.core;
  if (typeof core !== 'object' || core === null || Array.isArray(core)) {
    throw new UsageError(
      `${CORE_RELEASE_SET_PATH} has no core object`,
      'regenerate it with core-release switch --apply from the core checkout',
    );
  }
  const { sha, registry, scope, packages } = core as Record<string, unknown>;
  if (typeof sha !== 'string' || !COMMIT.test(sha)) {
    throw new UsageError(
      `${CORE_RELEASE_SET_PATH} records no full core commit in core.sha`,
      'regenerate it with core-release switch --apply from the core checkout',
    );
  }
  const entries = packages;
  if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) {
    throw new UsageError(
      `${CORE_RELEASE_SET_PATH} has no core.packages object`,
      'regenerate it with core-release switch --apply from the core checkout',
    );
  }
  const resolved: Record<string, string> = {};
  for (const [name, specifier] of Object.entries(entries as Record<string, unknown>)) {
    if (typeof specifier !== 'string' || specifier === '') {
      throw new UsageError(
        `${CORE_RELEASE_SET_PATH} has no specifier for ${name}`,
        'regenerate it with core-release switch --apply from the core checkout',
      );
    }
    // An unvalidated specifier would land in a game's manifest and fail the install there instead of here.
    if (!SPECIFIER.test(specifier)) {
      throw new UsageError(
        `${CORE_RELEASE_SET_PATH} has no exact version or npm: alias for ${name}`,
        'regenerate it with core-release switch --apply from the core checkout',
      );
    }
    resolved[name] = specifier;
  }
  return {
    sha: sha.toLowerCase(),
    registry: typeof registry === 'string' ? registry : '',
    scope: typeof scope === 'string' ? scope : '',
    packages: resolved,
  };
}

/** Every local-protocol core dependency a manifest declares; instance-owned packages are ignored. */
export function localCoreDependencies(manifest: Record<string, unknown>): string[] {
  const names: string[] = [];
  for (const section of DEPENDENCY_SECTIONS) {
    const block = manifest[section];
    if (typeof block !== 'object' || block === null || Array.isArray(block)) continue;
    for (const [name, specifier] of Object.entries(block as Record<string, unknown>)) {
      if (typeof specifier !== 'string' || !LOCAL_PROTOCOL.test(specifier)) continue;
      if (name.startsWith('@gm/') || name.startsWith('@ogm/')) names.push(name);
    }
  }
  return names.sort();
}

/**
 * Replaces a scaffolded game's local core dependencies with the released specifiers and leaves every
 * other dependency (instance-owned `@game/*` and `packages/*` links) exactly as the template wrote it.
 * Returns the manifest text to write plus what could not be resolved.
 */
export function resolveCoreDependencies(
  text: string,
  set: CoreReleaseSet | null,
): { after: string; resolution: CoreResolution } {
  const manifest = JSON.parse(text) as Record<string, unknown>;
  const resolved: Record<string, string> = {};
  const missing: string[] = [];

  for (const section of DEPENDENCY_SECTIONS) {
    const block = manifest[section];
    if (typeof block !== 'object' || block === null || Array.isArray(block)) continue;
    const dependencies = block as Record<string, string>;
    for (const [name, specifier] of Object.entries(dependencies)) {
      if (typeof specifier !== 'string' || !LOCAL_PROTOCOL.test(specifier)) continue;
      if (!name.startsWith('@gm/') && !name.startsWith('@ogm/')) continue;
      const released = set?.packages[name];
      if (released === undefined) {
        missing.push(name);
        continue;
      }
      dependencies[name] = released;
      resolved[name] = released;
    }
  }

  const after =
    missing.length === 0 && Object.keys(resolved).length > 0 ? `${JSON.stringify(manifest, null, 2)}\n` : text;
  return { after, resolution: { set, resolved, missing } };
}
