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
  if (scope.revision === row.revision && row.scopeHash === hash) return;
  if (
    scope.revision === row.revision &&
    row.scope !== null &&
    JSON.stringify(AgreedScope.parse(JSON.parse(row.scope) as unknown)) === scopeJson
  )
    return;
  if (scope.revision <= row.revision) {
    ctx.log({
      event: 'scope-agreed-rejected',
      jobId: line.job_id,
      reason: 'stale_revision',
      sessionId: row.id,
      sessionRevision: row.revision,
      payloadRevision: scope.revision,
    });
    throw new Error('scope_revision_stale');
  }
  const expectedRevision = row.revision + 1;
  if (scope.revision !== expectedRevision) {
    ctx.log({
      event: 'scope-agreed-rejected',
      jobId: line.job_id,
      reason: 'revision_mismatch',
      sessionId: row.id,
      expectedRevision,
      payloadRevision: scope.revision,
    });
    throw new Error('scope_revision_mismatch');
  }
  const expectedStatus = row.revision === 0 ? 'open' : 'revising';
  if (row.status !== expectedStatus) {
    ctx.log({
      event: 'scope-agreed-rejected',
      jobId: line.job_id,
      reason: 'revision_not_started',
      sessionId: row.id,
      sessionRevision: row.revision,
      status: row.status,
    });
    throw new Error('scope_revision_not_started');
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
        text: scope.revision === 1 ? 'Scope agreed' : 'Scope revised',
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
