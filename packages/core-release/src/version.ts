import { ReleaseError } from './graph.js';

const COMMIT = /^[0-9a-f]{40}$/i;
const BASE = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

/** The first 12 characters of a core commit, lower case — the part versions and branches carry. */
export function shortCoreSha(sha: string): string {
  if (!COMMIT.test(sha)) throw new ReleaseError(`core commit ${sha} is not a 40-character commit id`);
  return sha.slice(0, 12).toLowerCase();
}

/**
 * An immutable version per pinned core commit: `<package version>-core.<sha12>`.
 *
 * The commit is in the version, so the same commit can only ever produce the same version, and a new
 * pin produces a new version without republishing an old one. A package whose manifest version
 * already carries a prerelease keeps it and gains a `.core.<sha12>` identifier.
 */
export function coreVersion(manifestVersion: string, sha: string): string {
  const short = shortCoreSha(sha);
  if (!BASE.test(manifestVersion)) {
    throw new ReleaseError(`manifest version ${manifestVersion} is not a semantic version`);
  }
  const withoutBuild = manifestVersion.split('+')[0] ?? manifestVersion;
  if (withoutBuild.includes('-')) return `${withoutBuild}.core.${short}`;
  return `${withoutBuild}-core.${short}`;
}

export type CorePin = { readonly sha: string };

export type PinRead = { readonly ok: true; readonly pin: CorePin } | { readonly ok: false; readonly reason: string };

/**
 * Reads the pin an instance repository keeps in `vendor/core.json`. The file belongs to the instance
 * repository (`services/core-bump` writes and reads the same field), and its `core.sha` is the commit
 * the release versions must come from — the same pin as the vendored tarballs.
 */
export function readCorePin(text: string): PinRead {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'vendor/core.json is not JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'vendor/core.json is not an object' };
  }
  const core = (parsed as { core?: unknown }).core;
  if (typeof core !== 'object' || core === null || Array.isArray(core)) {
    return { ok: false, reason: 'vendor/core.json has no core object' };
  }
  const sha = (core as { sha?: unknown }).sha;
  if (typeof sha !== 'string' || !COMMIT.test(sha)) {
    return { ok: false, reason: 'core.sha is not a 40-character commit id' };
  }
  return { ok: true, pin: { sha: sha.toLowerCase() } };
}
