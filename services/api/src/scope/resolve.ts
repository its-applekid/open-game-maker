import type { VoiceTarget } from '@ogm/contracts';
import type { Db } from '@ogm/db';

import { scopeSessions } from './store.js';

type ScopeTarget = Extract<VoiceTarget, { kind: 'scope' }>;

export function ticketForScopeTarget(db: Db, target: ScopeTarget): string | null {
  const session = scopeSessions.get(db, target.session_id);
  if (session === null || session.game_id !== target.game_id || session.creator_id !== target.creator_id) return null;
  return session.ticket ?? null;
}
