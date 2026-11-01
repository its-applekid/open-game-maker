import { allowed } from './result.js';
import type { BoundaryVerdict, OperationName, Repository, Visibility } from './types.js';

export type GateInput = {
  kind: OperationName;
  repository: Repository;
  targetVisibility?: Visibility;
  files?: { path: string; bytes: number }[];
  prNumber?: number;
  sha?: string;
};

export interface BoundaryGate {
  evaluate(input: GateInput): Promise<BoundaryVerdict>;
}

const missingGate: BoundaryVerdict = {
  allowed: false,
  reasons: [{ code: 'denylist', detail: 'content gate not installed (OGM-039)' }],
};

export class DefaultBoundaryGate implements BoundaryGate {
  async evaluate(input: GateInput): Promise<BoundaryVerdict> {
    if (input.kind === 'set_visibility' && input.targetVisibility === 'public') return missingGate;
    if (input.kind === 'release' && input.repository.visibility === 'public') return missingGate;
    return allowed();
  }
}
