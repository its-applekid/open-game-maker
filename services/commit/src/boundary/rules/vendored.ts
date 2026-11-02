import type { LockEntry } from '@ogm/contracts';

import type { BoundaryFile, BoundaryReason, BoundaryRule } from '../types.js';

/** Binaries above this size anywhere in the repo are treated as asset bytes (D-ASSETS-REFERENCE). */
export const MAX_UNVENDORED_BINARY_BYTES = 32 * 1024;

const RULE = 'game repos reference assets, they do not carry them';

function isAssetBytes(file: BoundaryFile): boolean {
  if (file.status === 'removed') return false;
  return (
    file.path.replaceAll('\\', '/').startsWith('assets/') || (file.binary && file.bytes > MAX_UNVENDORED_BINARY_BYTES)
  );
}

/** Every sha256 an entry pins: the primary file and its companion `files[]`. */
function entryShas(entry: LockEntry): string[] {
  return [entry.sha256, ...(entry.files ?? []).map((file) => file.sha256)];
}

function entryPaths(entry: LockEntry): string[] {
  return [entry.path, ...(entry.files ?? []).map((file) => file.path)].map((path) => path.replaceAll('\\', '/'));
}

function vendorable(entry: LockEntry): boolean {
  return entry.rights.redistribution === 'free';
}

/** Lock entries written before `source` existed already point at repo-owned bytes. */
function isVendored(entry: LockEntry): boolean {
  return (entry.source ?? 'vendored') === 'vendored';
}

function refusal(file: BoundaryFile, entries: LockEntry[]): BoundaryReason {
  const reason = (detail: string): BoundaryReason => ({ code: 'rights', path: file.path, detail });
  const free = entries.find(vendorable);
  if (free !== undefined) return reason(`${free.id} is not vendored; ${RULE}. Try: gm assets vendor ${free.id}`);
  const [restricted] = entries;
  if (restricted !== undefined) {
    return reason(
      `${restricted.id}: rights do not allow redistribution in the repo; ${RULE}. Try: remove the file, gm build assets resolves it`,
    );
  }
  return reason(`asset bytes are not in assets.lock.json; ${RULE}. Try: gm assets register`);
}

/**
 * Asset bytes enter a game repo only through `gm assets vendor`: a file under `assets/`, or any binary over
 * {@link MAX_UNVENDORED_BINARY_BYTES}, must match a vendored lock entry whose rights allow free redistribution.
 * Legacy entries without `source` are vendored by contract.
 */
export const vendoredRule: BoundaryRule = (input) => {
  const bySha = new Map<string, LockEntry[]>();
  const vendoredPaths = new Set<string>();
  for (const entry of input.lockfile?.assets ?? []) {
    for (const sha of entryShas(entry)) bySha.set(sha, [...(bySha.get(sha) ?? []), entry]);
    if (isVendored(entry) && vendorable(entry)) {
      for (const path of entryPaths(entry)) vendoredPaths.add(path);
    }
  }

  const reasons: BoundaryReason[] = [];
  for (const file of input.files.filter(isAssetBytes)) {
    const entries = bySha.get(file.sha256) ?? [];
    if (entries.some((entry) => isVendored(entry) && vendorable(entry))) continue;
    /* The rights rule names a hash mismatch for an otherwise valid vendored repo path; do not duplicate it. */
    if (file.path.replaceAll('\\', '/').startsWith('assets/') && vendoredPaths.has(file.path.replaceAll('\\', '/'))) {
      continue;
    }
    reasons.push(refusal(file, entries));
  }
  return reasons;
};
