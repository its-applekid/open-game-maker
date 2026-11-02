import type { BoundaryVerdict } from '@ogm/contracts';

import { denylistRule } from './rules/denylist.js';
import { pathRule } from './rules/path.js';
import { piiRule } from './rules/pii.js';
import { rightsRule } from './rules/rights.js';
import { secretRule } from './rules/secret.js';
import { sizeRule } from './rules/size.js';
import type { BoundaryInput, BoundaryRule } from './types.js';

export const boundaryRules: readonly BoundaryRule[] = [
  pathRule,
  sizeRule,
  denylistRule,
  secretRule,
  piiRule,
  rightsRule,
];

export function evaluateBoundary(
  input: BoundaryInput,
  rules: readonly BoundaryRule[] = boundaryRules,
): BoundaryVerdict {
  const allReasons = rules.flatMap((rule) => rule(input));
  const reasons =
    allReasons.length <= 50
      ? allReasons
      : [...allReasons.slice(0, 50), { code: 'denylist' as const, detail: `… and ${allReasons.length - 50} more` }];
  return { allowed: reasons.length === 0, reasons };
}

export function evaluateDiff(input: Omit<BoundaryInput, 'mode'>): BoundaryVerdict {
  return evaluateBoundary({ ...input, mode: 'diff' });
}

export function evaluateTree(input: Omit<BoundaryInput, 'mode'>): BoundaryVerdict {
  return evaluateBoundary({ ...input, mode: 'tree' });
}
