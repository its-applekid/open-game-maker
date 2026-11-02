import { describe, expect, it } from 'vitest';

import { CreateJobRequest } from '@ogm/contracts';

import { editJobRequest } from './edit';

const gameId = 'g_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e6f';

describe('editJobRequest', () => {
  it('turns the message into an edit-slot job on the chosen branch', () => {
    const request = editJobRequest({ gameId, branchId: 'v2' }, 'Make the door\nglow', 'now', 'edit:k');

    expect(request).toMatchObject({
      gameId,
      branchId: 'v2',
      kind: 'feature',
      start: 'now',
      idempotencyKey: 'edit:k',
      plan: {
        title: 'Make the door glow',
        summary: 'Make the door\nglow',
        tickets: [{ key: 'edit', acceptanceCriteria: ['Make the door\nglow'] }],
      },
    });
    expect(CreateJobRequest.safeParse(request).success).toBe(true);
  });

  it('stays within the plan limits for a long message', () => {
    const text = 'a'.repeat(5000);
    const request = editJobRequest({ gameId, branchId: 'main' }, text, 'at_reset', 'edit:k');

    expect(CreateJobRequest.safeParse(request).success).toBe(true);
    expect(request.plan.title).toHaveLength(120);
  });
});
