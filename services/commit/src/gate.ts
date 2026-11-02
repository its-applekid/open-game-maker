import type { BoundaryVerdict, OperationName, Repository, Visibility } from './types.js';

export type GateInput = {
  kind: OperationName;
  gameId: string;
  repository: Repository;
  targetVisibility?: Visibility;
  files?: { path: string; content: string; mode?: string }[];
  prNumber?: number;
  sha?: string;
};

export interface BoundaryGate {
  evaluate(input: GateInput): Promise<BoundaryVerdict>;
}
