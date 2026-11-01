import type { LockEntry } from '@ogm/contracts';

import type { BoundaryFile, BoundaryReason, BoundaryRule } from '../types.js';

function isAsset(file: BoundaryFile): boolean {
  return file.status !== 'removed' && file.path.replaceAll('\\', '/').startsWith('assets/');
}

function detail(entry: LockEntry, rule: string): BoundaryReason {
  return { code: 'rights', path: entry.path, detail: `${entry.id}: ${rule}` };
}

function entryReasons(entry: LockEntry, input: Parameters<BoundaryRule>[0]): BoundaryReason[] {
  const reasons: BoundaryReason[] = [];
  const hasInGame = entry.rights.uses.includes('in-game');
  const draftPlaceholder = input.mode === 'diff' && input.draft && entry.rights.uses.includes('placeholder');
  if (!hasInGame && !draftPlaceholder) {
    reasons.push(detail(entry, input.mode === 'tree' ? 'placeholder-only assets cannot be published' : 'rights do not allow in-game use'));
  }
  if (entry.rights.redistribution === 'none') {
    reasons.push(detail(entry, 'rights prohibit redistribution'));
  }
  if (input.visibility === 'public' && entry.rights.audience === 'private') {
    reasons.push(detail(entry, 'private-audience asset cannot enter a public repository'));
  }
  return reasons;
}

export const rightsRule: BoundaryRule = (input) => {
  if (input.lockfile === null) {
    const asset = input.files.find(isAsset);
    if (input.mode === 'tree' || asset !== undefined) {
      return [{
        code: 'rights',
        path: asset?.path ?? 'assets.lock.json',
        detail: input.mode === 'tree' ? 'assets.lock.json is missing' : 'asset cannot be checked without assets.lock.json',
      }];
    }
    return [];
  }

  const entries = new Map(input.lockfile.assets.map((entry) => [entry.path.replaceAll('\\', '/'), entry]));
  const files = new Map(input.files.filter((file) => file.status !== 'removed').map((file) => [file.path.replaceAll('\\', '/'), file]));
  const reasons: BoundaryReason[] = [];
  const checked = new Set<string>();

  for (const file of input.files.filter(isAsset)) {
    const normalized = file.path.replaceAll('\\', '/');
    const entry = entries.get(normalized);
    if (entry === undefined) {
      reasons.push({ code: 'rights', path: file.path, detail: 'asset is not listed in assets.lock.json' });
      continue;
    }
    checked.add(normalized);
    reasons.push(...entryReasons(entry, input));
  }

  const checkWholeLock = input.mode === 'tree' || files.has('assets.lock.json');
  if (checkWholeLock) {
    for (const entry of input.lockfile.assets) {
      const normalized = entry.path.replaceAll('\\', '/');
      if (!checked.has(normalized)) reasons.push(...entryReasons(entry, input));
      if (input.mode === 'tree' && !files.has(normalized)) {
        reasons.push(detail(entry, 'locked asset file is missing'));
      }
    }
  }
  return reasons;
};
