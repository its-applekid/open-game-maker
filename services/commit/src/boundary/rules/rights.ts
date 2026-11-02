import type { LockEntry } from '@ogm/contracts';

import type { BoundaryFile, BoundaryReason, BoundaryRule } from '../types.js';

function isAsset(file: BoundaryFile): boolean {
  return file.status !== 'removed' && file.path.replaceAll('\\', '/').startsWith('assets/');
}

function inRepo(entry: LockEntry): boolean {
  return (entry.source ?? 'vendored') === 'vendored';
}

function detail(entry: LockEntry, rule: string): BoundaryReason {
  return { code: 'rights', path: entry.path, detail: `${entry.id}: ${rule}` };
}

function entryReasons(entry: LockEntry, input: Parameters<BoundaryRule>[0]): BoundaryReason[] {
  const reasons: BoundaryReason[] = [];
  const hasInGame = entry.rights.uses.includes('in-game');
  const draftPlaceholder = input.mode === 'diff' && input.draft && entry.rights.uses.includes('placeholder');
  if (!hasInGame && !draftPlaceholder) {
    reasons.push(
      detail(
        entry,
        input.mode === 'tree' ? 'placeholder-only assets cannot be published' : 'rights do not allow in-game use',
      ),
    );
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
      return [
        {
          code: 'rights',
          path: asset?.path ?? 'assets.lock.json',
          detail:
            input.mode === 'tree' ? 'assets.lock.json is missing' : 'asset cannot be checked without assets.lock.json',
        },
      ];
    }
    return [];
  }

  /* Library and blob entries name bytes outside the repo (D-ASSETS-REFERENCE); only vendored ones own repo files. */
  const repoFiles = new Map<string, { entry: LockEntry; sha256: string }>();
  for (const entry of input.lockfile.assets.filter(inRepo)) {
    for (const locked of [{ path: entry.path, sha256: entry.sha256 }, ...(entry.files ?? [])]) {
      repoFiles.set(locked.path.replaceAll('\\', '/'), { entry, sha256: locked.sha256 });
    }
  }
  const files = new Map(
    input.files.filter((file) => file.status !== 'removed').map((file) => [file.path.replaceAll('\\', '/'), file]),
  );
  const reasons: BoundaryReason[] = [];
  const checked = new Set<string>();

  for (const file of input.files.filter(isAsset)) {
    const locked = repoFiles.get(file.path.replaceAll('\\', '/'));
    if (locked === undefined) {
      reasons.push({ code: 'rights', path: file.path, detail: 'asset is not listed in assets.lock.json' });
      continue;
    }
    if (file.sha256 !== locked.sha256) reasons.push(detail(locked.entry, 'sha256 does not match assets.lock.json'));
    if (checked.has(locked.entry.id)) continue;
    checked.add(locked.entry.id);
    reasons.push(...entryReasons(locked.entry, input));
  }

  const checkWholeLock = input.mode === 'tree' || files.has('assets.lock.json');
  if (checkWholeLock) {
    for (const entry of input.lockfile.assets) {
      if (!checked.has(entry.id)) reasons.push(...entryReasons(entry, input));
    }
    if (input.mode === 'tree') {
      for (const [path, locked] of repoFiles) {
        if (!files.has(path)) reasons.push({ ...detail(locked.entry, 'locked asset file is missing'), path });
      }
    }
  }
  return reasons;
};
