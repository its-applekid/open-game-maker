import type { CommitOp } from '../types.js';

export type ExtractCommitOp<K extends CommitOp['kind']> = Extract<CommitOp, { kind: K }>;
