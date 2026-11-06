import type { BoundaryVerdict, OperationName, Repository, Visibility } from './types.js';

export type GateInput = {
  kind: OperationName;
  gameId: string;
  repository: Repository;
  targetVisibility?: Visibility;
  files?: { path: string; content: string; mode?: string }[];
  prNumber?: number;
  sha?: string;
  // The game's folder in the instance repository; set for every change inside it.
  gamePath?: string;
  // Set only for a change the executor approved as a promotion into `packages/`.
  promotion?: boolean;
};

export interface BoundaryGate {
  evaluate(input: GateInput): Promise<BoundaryVerdict>;
}
