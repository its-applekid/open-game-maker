import { createHash } from 'node:crypto';

import { canonical } from './canonical.js';

export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
