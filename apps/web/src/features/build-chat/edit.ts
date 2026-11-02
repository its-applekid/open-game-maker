import type { CreateJobRequest } from '@ogm/contracts';

import type { EditDraft } from './dock';

export function editJobRequest(
  target: Pick<EditDraft, 'gameId' | 'branchId'>,
  text: string,
  start: 'now' | 'at_reset',
  idempotencyKey: string,
): CreateJobRequest {
  const line = text.replace(/\s+/g, ' ').trim();
  return {
    gameId: target.gameId,
    branchId: target.branchId,
    kind: 'feature',
    complexity: 2,
    plan: {
      title: line.length > 120 ? `${line.slice(0, 119)}…` : line,
      summary: text.slice(0, 4000),
      scope: { included: [text], excluded: [] },
      tickets: [{ key: 'edit', skills: [], dependsOn: [], acceptanceCriteria: [text] }],
    },
    start,
    idempotencyKey,
  };
}
