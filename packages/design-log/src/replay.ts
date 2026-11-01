import type { Branch, DesignDoc, Transaction } from '@ogm/contracts';

import { apply } from './apply.js';

export type ReplaySegment = { branch: Branch; txs: readonly Transaction[] };
export type ReplayInput = { baseDoc: DesignDoc; chain: readonly ReplaySegment[] };
export type ReplayResult = { doc: DesignDoc; headRev: number };

export class GapError extends Error {
  readonly expected: number;
  readonly actual: number | undefined;
  readonly branchId: string;

  constructor(branchId: string, expected: number, actual?: number) {
    super(`revision gap on ${branchId}: expected ${expected}, got ${actual ?? 'end of log'}`);
    this.name = 'GapError';
    this.branchId = branchId;
    this.expected = expected;
    this.actual = actual;
  }
}

export class ForkPointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForkPointError';
  }
}

export class InvalidRevisionError extends RangeError {
  readonly revision: number;

  constructor(revision: number) {
    super(`revision must be a nonnegative integer: ${revision}`);
    this.name = 'InvalidRevisionError';
    this.revision = revision;
  }
}

function segmentLimit(chain: readonly ReplaySegment[], index: number, upToRev: number | undefined): number {
  const segment = chain[index]!;
  const child = chain[index + 1];
  if (child !== undefined) {
    const fork = child.branch.forkPoint;
    if (fork === null || fork.parentBranchId !== segment.branch.id) {
      throw new ForkPointError(`branch ${child.branch.id} does not fork from ${segment.branch.id}`);
    }
    return fork.parentRev;
  }
  return upToRev === undefined ? segment.branch.headRev : Math.min(upToRev, segment.branch.headRev);
}

export function replay(input: ReplayInput, upToRev?: number): ReplayResult {
  if (upToRev !== undefined && (!Number.isInteger(upToRev) || upToRev < 0)) {
    throw new InvalidRevisionError(upToRev);
  }
  if (input.chain.length === 0) return { doc: input.baseDoc, headRev: 0 };
  let doc = input.baseDoc;
  let leafHeadRev = 0;

  input.chain.forEach((segment, index) => {
    const limit = segmentLimit(input.chain, index, upToRev);
    const txs = [...segment.txs].sort((left, right) => left.rev - right.rev);
    let expected = 1;
    for (const tx of txs) {
      if (tx.rev > limit) break;
      if (tx.branchId !== segment.branch.id) {
        throw new ForkPointError(`transaction ${tx.id} belongs to ${tx.branchId}, not ${segment.branch.id}`);
      }
      if (tx.rev !== expected) throw new GapError(segment.branch.id, expected, tx.rev);
      doc = apply(doc, tx.patches);
      expected += 1;
    }
    if (expected <= limit) throw new GapError(segment.branch.id, expected);
    if (index === input.chain.length - 1) leafHeadRev = limit;
  });

  return { doc, headRev: leafHeadRev };
}
