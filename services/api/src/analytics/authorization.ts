import type { Principal } from '@ogm/contracts';
import { authorize } from '@ogm/policy';

import { actorFromPrincipal, requireAuthorization } from '../accounts/families.js';

export function requireAnalyticsAdmin(principal: Extract<Principal, { kind: 'user' }>, familyId?: string): void {
  requireAuthorization(authorize(actorFromPrincipal(principal), 'admin.analytics.read', { familyId }));
}
