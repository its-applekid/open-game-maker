import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import { CORE_RELEASE_SET_PATH, isCorePackageName, readCoreReleaseSet } from './release-set.js';
import { MANAGED_END, MANAGED_START, manifestPaths } from './switch.js';
import { readCorePin } from './version.js';

/** The two registry fields the checks need; a release set records exactly these. */
export type Destination = { readonly registry: string; readonly scope: string };

const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;
const LOCAL_PROTOCOLS = ['file:', 'workspace:'];
const LOCKFILE = 'pnpm-lock.yaml';

export type Finding = {
  /** Stable id an instance repository's checks can key on. */
  readonly code: string;
  readonly severity: 'error' | 'warning';
  /** Repository-relative path the finding is about. */
  readonly path: string;
  readonly detail: string;
  readonly fix: string;
};

export type DiagnoseInput = {
  readonly dir: string;
  /** The destination to check against; defaults to the one the release set records. */
  readonly destination?: Destination;
  /** Proves the published versions exist; only called when `online` is set. */
  readonly fetchImpl?: typeof fetch;
  readonly online?: boolean;
};

export type Diagnosis = {
  readonly dir: string;
  /** The core commit the repository runs, when it records one. */
  readonly pin: string | null;
  readonly set: ReturnType<typeof readCoreReleaseSet> | null;
  readonly findings: readonly Finding[];
  readonly checked: readonly string[];
};

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/** The `npm:` alias target's name, or the dependency name itself when the specifier is a bare version. */
function destinationOf(dependency: string, specifier: string): string {
  if (!specifier.startsWith('npm:')) return dependency;
  const at = specifier.lastIndexOf('@');
  return at <= 'npm:'.length ? dependency : specifier.slice('npm:'.length, at);
}

function versionOf(specifier: string): string | null {
  const at = specifier.lastIndexOf('@');
  if (at === -1) return specifier;
  const version = specifier.slice(at + 1);
  return /^\d+\.\d+\.\d+/.test(version) ? version : null;
}

/**
 * Reads an instance or standalone game repository without writing anything and reports what would stop
 * a game install: legacy vendored/local core specifiers, a release set that is missing, malformed or
 * stale against the pin, specifier drift, a `.npmrc` without the registry block, orphaned tarballs, and
 * lockfile entries without integrity. `--online` additionally proves each version is published.
 */
export async function diagnose(input: DiagnoseInput): Promise<Diagnosis> {
  const { dir } = input;
  const findings: Finding[] = [];
  const checked: string[] = [];

  const pinText = await readText(join(dir, 'vendor', 'core.json'));
  let pin: string | null = null;
  if (pinText === null) {
    findings.push({
      code: 'pin-missing',
      severity: 'warning',
      path: 'vendor/core.json',
      detail: 'the repository records no core pin; a standalone game repository needs one for a reproducible set',
      fix: 'add vendor/core.json with {"core":{"sha":"<40-character commit id>"}} or pass --core-sha to switch',
    });
  } else {
    const read = readCorePin(pinText);
    if (read.ok) {
      pin = read.pin.sha;
      checked.push(`vendor/core.json pins ${pin.slice(0, 12)}`);
    } else {
      findings.push({
        code: 'pin-invalid',
        severity: 'error',
        path: 'vendor/core.json',
        detail: read.reason,
        fix: 'write {"core":{"sha":"<40-character commit id>"}}',
      });
    }
  }

  const setText = await readText(join(dir, CORE_RELEASE_SET_PATH));
  const set = setText === null ? null : readCoreReleaseSet(setText);
  if (setText === null) {
    findings.push({
      code: 'set-missing',
      severity: 'error',
      path: CORE_RELEASE_SET_PATH,
      detail:
        'no released core version set; gm new cannot resolve the templates\u2019 core dependencies from the registry',
      fix: 'run core-release switch --dir <repo> --root <core checkout> --apply once the core packages are published',
    });
  } else if (set !== null && !set.ok) {
    findings.push({
      code: 'set-invalid',
      severity: 'error',
      path: CORE_RELEASE_SET_PATH,
      detail: set.reason,
      fix: 'regenerate it with core-release switch --apply',
    });
  } else if (set !== null && set.ok && pin !== null && set.set.sha !== pin) {
    findings.push({
      code: 'set-stale',
      severity: 'error',
      path: CORE_RELEASE_SET_PATH,
      detail: `the set came from ${set.set.sha.slice(0, 12)} but the repository pins ${pin.slice(0, 12)}`,
      fix: 'run core-release switch --apply to record the set for the current pin',
    });
  }
  const released = set !== null && set.ok ? set.set : null;
  if (released !== null)
    checked.push(`${CORE_RELEASE_SET_PATH} holds ${Object.keys(released.packages).length} specifiers`);

  const destination = input.destination ?? (released !== null ? released : null);
  const referenced = new Set<string>();
  /** Core packages some manifest in this repository actually declares. */
  const declared = new Set<string>();
  for (const path of await manifestPaths(dir)) {
    const text = await readText(path);
    if (text === null) continue;
    const where = relative(dir, path);
    let manifest: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object');
      manifest = parsed as Record<string, unknown>;
    } catch {
      findings.push({
        code: 'manifest-invalid',
        severity: 'error',
        path: where,
        detail: 'the manifest is not a JSON object, so its dependencies cannot be read',
        fix: 'repair the manifest, then run core-release switch --apply',
      });
      continue;
    }
    for (const section of DEPENDENCY_SECTIONS) {
      const block = manifest[section];
      if (typeof block !== 'object' || block === null || Array.isArray(block)) continue;
      for (const [dependency, specifier] of Object.entries(block as Record<string, unknown>)) {
        if (typeof specifier !== 'string') continue;
        // A `file:` reference is relative to its own manifest; record where it lands in the repository so
        // the orphan check compares like with like.
        if (specifier.startsWith('file:')) {
          referenced.add(relative(dir, resolve(dirname(path), specifier.slice('file:'.length))));
        }
        const core = isCorePackageName(dependency) || released?.packages[dependency] !== undefined;
        if (!core) continue;
        declared.add(dependency);
        const local = LOCAL_PROTOCOLS.find((protocol) => specifier.startsWith(protocol));
        if (local !== undefined) {
          findings.push({
            code: 'legacy-specifier',
            severity: 'error',
            path: where,
            detail: `${dependency} is ${specifier}; a game outside this repository cannot install a ${local} reference`,
            fix: 'run core-release switch --apply to replace it with the released version',
          });
          continue;
        }
        const expected = released?.packages[dependency];
        if (expected === undefined) {
          findings.push({
            code: 'core-not-released',
            severity: 'error',
            path: where,
            detail: `${dependency} is a core package the release set does not list`,
            fix: 'regenerate the set with core-release switch --apply from the matching core commit',
          });
          continue;
        }
        if (specifier !== expected) {
          findings.push({
            code: 'version-drift',
            severity: 'error',
            path: where,
            detail: `${dependency} is ${specifier} but the release set says ${expected}`,
            fix: 'run core-release switch --apply, or update the set for the pin you want',
          });
        }
      }
    }
  }

  const npmrc = await readText(join(dir, '.npmrc'));
  const scope = destination?.scope;
  if (scope !== undefined) {
    const block = npmrc ?? '';
    const managed = block.includes(MANAGED_START) && block.includes(MANAGED_END);
    const scoped = new RegExp(`^${scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:registry=`, 'm').test(block);
    if (!managed || !scoped) {
      findings.push({
        code: 'registry-not-configured',
        severity: 'error',
        path: '.npmrc',
        detail: `the .npmrc does not point ${scope} at the registry, so pnpm would look for the released packages elsewhere`,
        fix: 'run core-release switch --apply to write the managed registry block',
      });
    }
    if (/^offline\s*=\s*true$/m.test(block)) {
      findings.push({
        code: 'offline-enabled',
        severity: 'error',
        path: '.npmrc',
        detail: 'offline=true is set, so a registry install cannot resolve',
        fix: 'run core-release switch --apply; it comments the line out',
      });
    }
  }

  const vendor = join(dir, 'vendor');
  const vendorIsDirectory = await stat(vendor).then(
    (info) => info.isDirectory(),
    () => false,
  );
  if (vendorIsDirectory) {
    for (const entry of (await readdir(vendor)).filter((name) => name.endsWith('.tgz')).sort()) {
      const relativePath = `vendor/${entry}`;
      if (referenced.has(relativePath)) continue;
      findings.push({
        code: 'orphan-tarball',
        severity: 'warning',
        path: relativePath,
        detail: 'no manifest references this tarball any more',
        fix: 'delete it; core-release switch --apply removes what it switches',
      });
    }
  }

  const lockText = await readText(join(dir, LOCKFILE));
  if (lockText !== null && released !== null) {
    // Only a package this repository declares belongs in its lockfile; the set also lists the adapters a
    // game only installs when it pins one.
    for (const [dependency, specifier] of Object.entries(released.packages)) {
      if (!declared.has(dependency)) continue;
      const name = destinationOf(dependency, specifier);
      const version = versionOf(specifier);
      if (version === null) continue;
      const key = `${name}@${version}`;
      if (!lockText.includes(key)) {
        findings.push({
          code: 'lockfile-stale',
          severity: 'warning',
          path: LOCKFILE,
          detail: `${key} is not in the lockfile`,
          fix: 'run pnpm install and commit the refreshed lockfile',
        });
        continue;
      }
      const at = lockText.indexOf(`  '${key}':`);
      const block = at === -1 ? '' : lockText.slice(at, at + 400);
      if (!block.includes('integrity:')) {
        findings.push({
          code: 'lockfile-no-integrity',
          severity: 'warning',
          path: LOCKFILE,
          detail: `${key} has no integrity in the lockfile`,
          fix: 'run pnpm install against the registry and commit the refreshed lockfile',
        });
      }
    }
  }

  if (input.online === true) {
    if (released === null) {
      findings.push({
        code: 'online-skipped',
        severity: 'warning',
        path: CORE_RELEASE_SET_PATH,
        detail: 'nothing to prove online without a valid release set',
        fix: 'fix the release set first',
      });
    } else {
      for (const [dependency, specifier] of Object.entries(released.packages)) {
        const name = destinationOf(dependency, specifier);
        const version = versionOf(specifier);
        if (version === null) continue;
        const found = await publishedVersion({
          registry: released.registry,
          name,
          version,
          fetchImpl: input.fetchImpl,
        });
        if (found !== null) {
          findings.push({
            code: 'version-not-published',
            severity: 'error',
            path: CORE_RELEASE_SET_PATH,
            detail: `${name}@${version} (${dependency}): ${found}`,
            fix: 'publish the release closure from the matching core commit, then regenerate the set',
          });
        } else {
          checked.push(`${name}@${version} is published`);
        }
      }
    }
  }

  return { dir, pin, set, findings, checked };
}

/**
 * Asks the registry whether the exact version exists. Returns a reason when it does not, and `null`
 * when the version is there. A network failure is reported, never treated as "published".
 */
async function publishedVersion(args: {
  registry: string;
  name: string;
  version: string;
  fetchImpl?: typeof fetch;
}): Promise<string | null> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const url = `${args.registry}/${args.name.replace('/', '%2f')}`;
  try {
    // A registry that never answers must not hang an operator's diagnostic; the proof is opt-in and bounded.
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 404) return 'the registry has no such package';
    if (!response.ok) return `the registry answered ${response.status}`;
    const body = (await response.json()) as { versions?: Record<string, unknown> };
    if (body.versions === undefined || body.versions[args.version] === undefined) {
      return 'the registry does not list this version';
    }
    return null;
  } catch (error) {
    return `the registry could not be read: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** A one-line summary an instance repository's CI can print. */
export function describeDiagnosis(diagnosis: Diagnosis): string[] {
  const errors = diagnosis.findings.filter((finding) => finding.severity === 'error').length;
  const warnings = diagnosis.findings.length - errors;
  const head =
    diagnosis.findings.length === 0
      ? `core packages ok in ${diagnosis.dir}`
      : `core packages: ${errors} error(s), ${warnings} warning(s) in ${diagnosis.dir}`;
  return [
    head,
    ...diagnosis.findings.map(
      (finding) => `  ${finding.severity} ${finding.code} ${finding.path}: ${finding.detail} — ${finding.fix}`,
    ),
  ];
}

/** Exported for the CLI's own error message when a repository has no pin to switch from. */
export function missingPinMessage(dir: string): string {
  return (
    `${dir} has no vendor/core.json; a standalone game repository must name the core commit: ` +
    'pass --core-sha <40-hex>'
  );
}
