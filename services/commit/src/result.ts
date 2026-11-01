import type { BoundaryVerdict, CommitResult } from './types.js';

type ReasonCode = BoundaryVerdict['reasons'][number]['code'];

export function allowed(): BoundaryVerdict {
  return { allowed: true, reasons: [] };
}

export function refused(code: ReasonCode, detail: string, path?: string): CommitResult {
  const reason = path === undefined ? { code, detail } : { code, detail, path };
  return { ok: false, verdict: { allowed: false, reasons: [reason] } };
}
