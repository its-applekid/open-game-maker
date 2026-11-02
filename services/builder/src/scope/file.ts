import { ScopeChoices } from '@ogm/contracts';
import { schema, type Db } from '@ogm/db';
import { eq } from 'drizzle-orm';

import { renderScopeTicket } from './template.js';

export function scopeTicketForJob(db: Db, jobId: string): ReturnType<typeof renderScopeTicket> | null {
  const session = db.select().from(schema.scopeSessions).where(eq(schema.scopeSessions.jobId, jobId)).get();
  if (!session) return null;
  return renderScopeTicket({
    jobId,
    sessionId: session.id,
    choices: ScopeChoices.parse(JSON.parse(session.choices)),
  });
}
