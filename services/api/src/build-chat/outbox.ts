import { ChatPostPayload, type AgentOutboxLine } from '@ogm/contracts';

import { putMedia } from './media.js';
import type { OutboxContext } from './outbox-handlers.js';
import { getChatRow, insertChatRow, type StoredMedia } from './store.js';

export const type = 'chat.post';

// An agent text, still or clip becomes an agent row with the line's id; media is copied into the blob store first.
export async function handle(line: AgentOutboxLine, ctx: OutboxContext): Promise<void> {
  if (getChatRow(ctx.sqlite, line.id) !== null) return;
  const payload = ChatPostPayload.parse(line.payload);

  let media: StoredMedia | undefined;
  if (payload.kind !== 'text') {
    const file = await putMedia(ctx.blobStore, ctx.workspaceRoot, payload.file, payload.kind);
    const poster =
      payload.poster === undefined
        ? undefined
        : await putMedia(ctx.blobStore, ctx.workspaceRoot, payload.poster, 'image');
    media = { ...file, ...(poster === undefined ? {} : { posterHash: poster.hash }) };
  }

  const { inserted } = insertChatRow(ctx.sqlite, {
    id: line.id,
    jobId: line.job_id,
    at: line.at,
    actor: 'agent',
    kind: payload.kind,
    ...(payload.text === undefined ? {} : { text: payload.text }),
    ...(media === undefined ? {} : { media }),
  });
  if (inserted) ctx.publish(line.job_id);
}
