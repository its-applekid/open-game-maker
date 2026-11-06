/**
 * The pinned core commit an instance repository vendors. `vendor/core.json` is written by the instance's
 * `scripts/bump-core.sh`; this module only reads the `core.sha` field out of it.
 */

export type CorePin = { readonly sha: string };

export type PinRead = { readonly ok: true; readonly pin: CorePin } | { readonly ok: false; readonly reason: string };

const COMMIT = /^[0-9a-f]{40}$/i;

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

export function isCurrent(pin: CorePin, targetSha: string): boolean {
  return pin.sha === targetSha.toLowerCase();
}

export function branchFor(targetSha: string): string {
  return `core-bump/${targetSha.slice(0, 12).toLowerCase()}`;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 12).toLowerCase();
}
