import { ReleaseError } from './graph.js';
import type { RegistryProfile } from './profile.js';

/**
 * The released version set an instance repository keeps next to its core pin. `vendor/core.json`
 * records which core commit the repository runs; this file records, per core package, the exact
 * registry specifier to install at that commit. Scaffolding a game then needs neither the core
 * checkout nor the network: `gm new` copies the specifiers into the new game's manifest.
 * `core-release switch --apply` writes it; `core-release diagnose` checks it against the pin.
 */
export const CORE_RELEASE_SET_PATH = 'vendor/core-packages.json';
export const CORE_RELEASE_SET_VERSION = 1;

export type CoreReleaseSet = {
  /** The core commit every specifier in this set came from; must equal `vendor/core.json`'s pin. */
  readonly sha: string;
  readonly registry: string;
  readonly scope: string;
  /**
   * Source package name → the specifier a game installs. Usually an `npm:` alias to the destination
   * name so the game's imports keep the source name, e.g.
   * `"@gm/sdk": "npm:@open-game-maker/sdk@0.0.0-core.3cef9ec65caa"`.
   */
  readonly packages: Readonly<Record<string, string>>;
};

export type ReleaseSetRead =
  { readonly ok: true; readonly set: CoreReleaseSet } | { readonly ok: false; readonly reason: string };

const COMMIT = /^[0-9a-f]{40}$/i;
const SCOPE_PATTERN = '@[a-z0-9][a-z0-9._-]{0,213}';
const SCOPE = new RegExp(`^${SCOPE_PATTERN}$`);
const VERSION = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?`;
/** An exact version, or an `npm:` alias to one: the only two specifier shapes a release set may hold. */
const SPECIFIER = new RegExp(`^(?:${VERSION}|npm:(?:${SCOPE_PATTERN}/)?[a-z0-9][a-z0-9._-]*@${VERSION})$`);

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Reads and validates the release set. A malformed set is a refusal, never a partial read. */
export function readCoreReleaseSet(text: string): ReleaseSetRead {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: `${CORE_RELEASE_SET_PATH} is not JSON` };
  }
  const root = object(parsed);
  if (root === null) return { ok: false, reason: `${CORE_RELEASE_SET_PATH} is not an object` };
  if (root.v !== CORE_RELEASE_SET_VERSION) {
    return {
      ok: false,
      reason: `${CORE_RELEASE_SET_PATH} has v ${String(root.v)}; this tool reads v ${CORE_RELEASE_SET_VERSION}`,
    };
  }
  const core = object(root.core);
  if (core === null) return { ok: false, reason: `${CORE_RELEASE_SET_PATH} has no core object` };
  const sha = core.sha;
  if (typeof sha !== 'string' || !COMMIT.test(sha)) {
    return { ok: false, reason: 'core.sha is not a 40-character commit id' };
  }
  const registry = core.registry;
  if (typeof registry !== 'string' || !/^https?:\/\/[^/]+\/?$/.test(registry)) {
    return { ok: false, reason: 'core.registry is not an http(s) registry URL' };
  }
  const scope = core.scope;
  if (typeof scope !== 'string' || !SCOPE.test(scope)) {
    return { ok: false, reason: 'core.scope is not an npm scope like @owner' };
  }
  const packages = object(core.packages);
  if (packages === null) return { ok: false, reason: 'core.packages is not an object' };
  const names = Object.keys(packages).sort();
  if (names.length === 0) return { ok: false, reason: 'core.packages is empty' };
  const specifiers: Record<string, string> = {};
  for (const name of names) {
    const specifier = packages[name];
    if (!name.startsWith('@') || name.includes(' ')) {
      return { ok: false, reason: `core.packages key ${name} is not a scoped package name` };
    }
    if (typeof specifier !== 'string' || !SPECIFIER.test(specifier)) {
      return { ok: false, reason: `core.packages[${name}] is not an exact version or an npm: alias to one` };
    }
    specifiers[name] = specifier;
  }
  return {
    ok: true,
    set: { sha: sha.toLowerCase(), registry: registry.replace(/\/$/, ''), scope, packages: specifiers },
  };
}

/** The file text `core-release switch` writes: sorted keys, so a re-run of the same pin is byte-identical. */
export function coreReleaseSetText(args: {
  readonly sha: string;
  readonly profile: RegistryProfile;
  readonly versions: ReadonlyMap<string, string>;
}): string {
  const { sha, profile, versions } = args;
  if (!COMMIT.test(sha)) throw new ReleaseError(`core commit ${sha} is not a 40-character commit id`);
  if (versions.size === 0) throw new ReleaseError('the release set is empty; nothing to record');
  const packages: Record<string, string> = {};
  for (const name of [...versions.keys()].sort()) {
    const version = versions.get(name);
    if (version === undefined) throw new ReleaseError(`${name} has no released version to record`);
    packages[name] = releasedSpecifier(name, version, profile);
  }
  const document = {
    v: CORE_RELEASE_SET_VERSION,
    core: { sha: sha.toLowerCase(), registry: profile.registry, scope: profile.scope, packages },
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * The specifier a game installs for a released core package: the version itself when the destination
 * registry keeps the source name, otherwise an `npm:` alias so `import ... from '@gm/sdk'` still works.
 */
export function releasedSpecifier(dependency: string, version: string, profile: RegistryProfile): string {
  const prefix = `${profile.scope}/`;
  if (dependency.startsWith(prefix)) return version;
  const slash = dependency.indexOf('/');
  const destination = `${prefix}${slash === -1 ? dependency : dependency.slice(slash + 1)}`;
  return `npm:${destination}@${version}`;
}

/** Source names a core release set can hold: the core packages are scoped `@gm/*` and `@ogm/*`. */
export function isCorePackageName(name: string): boolean {
  return name.startsWith('@gm/') || name.startsWith('@ogm/');
}
