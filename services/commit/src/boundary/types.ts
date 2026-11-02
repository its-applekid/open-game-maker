import type { AssetsLock, BoundaryVerdict } from '@ogm/contracts';

export type BoundaryReason = BoundaryVerdict['reasons'][number];
export type BoundaryMode = 'diff' | 'tree';
export type BoundaryActor = 'agent' | 'platform';
export type BoundaryFileStatus = 'added' | 'modified' | 'removed' | 'renamed';

export type BoundaryFile = {
  path: string;
  status: BoundaryFileStatus;
  bytes: number;
  sha256: string;
  binary: boolean;
  content?: string;
  mode?: string;
};

export type BoundaryInput = {
  mode: BoundaryMode;
  actor: BoundaryActor;
  visibility: 'private' | 'public';
  draft: boolean;
  files: BoundaryFile[];
  lockfile: AssetsLock | null;
  blocklist: ReadonlySet<string> | null;
  profileNames: string[];
};

export type BoundaryRule = (input: BoundaryInput) => BoundaryReason[];
