import type { Principal } from '@ogm/contracts';

import { HttpError } from '../app/errors.js';

export function requireAnalyticsAdmin(principal: Extract<Principal, { kind: 'user' }>): void {
  if (principal.platformRole !== 'admin') throw new HttpError(403, 'forbidden');
}
