import type { BoundaryVerdict } from '@ogm/contracts';

import type { RightsReason } from './rights.js';

export class ReleaseError extends Error {
  constructor(
    readonly code: string,
    readonly status: 403 | 404 | 409 | 422 | 502,
    readonly payload?: { verdict: BoundaryVerdict } | { rights: RightsReason[] },
  ) {
    super(code);
    this.name = 'ReleaseError';
  }
}
