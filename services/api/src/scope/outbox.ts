import { createHash } from 'node:crypto';

import { AgreedScope, type AgentOutboxLine } from '@ogm/contracts';

import type { OutboxContext } from '../build-chat/outbox-handlers.js';
import { insertChatRow } from '../build-chat/store.js';
import { scopeSessions } from './store.js';

export const type = 'scope.agreed';

export async function handle(line: AgentOutboxLine, ctx: OutboxContext): Promise<void> {
  const scope = AgreedScope.parse(line.payload);
  const row = scopeSessions.rowByJob(ctx.db, line.job_id);
  if (row === null) {
    ctx.log({ event: 'scope-agreed-rejected', jobId: line.job_id, reason: 'session_missing' });
    throw new Error('scope_session_missing');
  }
  if (scope.session_id !== row.id) {
    ctx.log({
      event: 'scope-agreed-rejected',
      jobId: line.job_id,
      reason: 'session_mismatch',
      sessionId: row.id,
      payloadSessionId: scope.session_id,
    });
    throw new Error('scope_session_mismatch');
  }

  const scopeJson = JSON.stringify(scope);
  const hash = createHash('sha256').update(scopeJson).digest('hex');
  if (row.scopeHash === hash) return;
  if (row.status !== 'open' || row.scopeHash !== null) {
    ctx.log({ event: 'scope-agreed-rejected', jobId: line.job_id, reason: 'already_resolved', sessionId: row.id });
    throw new Error('scope_session_already_resolved');
  }

  const inserted = ctx.sqlite
    .transaction(() => {
      if (!scopeSessions.agree(ctx.db, row.id, scope, hash, line.at)) return false;
      return insertChatRow(ctx.sqlite, {
        id: line.id,
        jobId: line.job_id,
        at: line.at,
        actor: 'system',
        kind: 'text',
        text: 'Scope agreed',
      }).inserted;
    })
    .immediate();
  if (!inserted) return;

  ctx.publish(line.job_id);
  ctx.notify({
    kind: 'scope.agreed',
    userIds: [row.creatorId],
    gameId: row.gameId,
    jobId: row.jobId,
    sessionId: row.id,
  });
}
