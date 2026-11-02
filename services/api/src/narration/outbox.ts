import { z } from 'zod';

import type { AgentOutboxLine } from '@ogm/contracts';

import type { OutboxContext } from '../build-chat/outbox-handlers.js';
import { getChatRow, insertChatRow } from '../build-chat/store.js';
import { NarrationLine } from './render.js';

export const type = 'narration.render';

const Payload = z.object({ lines: z.array(NarrationLine).min(1).max(25) }).strict();

export async function handle(line: AgentOutboxLine, ctx: OutboxContext): Promise<void> {
  if (getChatRow(ctx.sqlite, line.id) !== null) return;
  if (!ctx.renderNarration) throw new Error('narration_unavailable');
  const { lines } = Payload.parse(line.payload);
  const results = await ctx.renderNarration(lines);
  const succeeded = results.filter((result) => 'key' in result);
  const cached = succeeded.filter((result) => result.cached).length;
  const failed = results.length - succeeded.length;
  const text =
    failed === 0
      ? `Rendered ${succeeded.length} narration lines, ${cached} cached.`
      : `Rendered ${succeeded.length} narration lines, ${cached} cached, ${failed} failed.`;
  const { inserted } = insertChatRow(ctx.sqlite, {
    id: line.id,
    jobId: line.job_id,
    at: line.at,
    actor: 'system',
    kind: 'text',
    text,
  });
  if (inserted) ctx.publish(line.job_id);
}
