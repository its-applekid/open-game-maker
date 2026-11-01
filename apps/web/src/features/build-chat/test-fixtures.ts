import type { Job } from '@ogm/contracts';

export function buildChatJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'j_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e6f',
    gameId: 'g_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e6f',
    branchId: 'main',
    familyId: 'f_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e6f',
    creatorId: 'u_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e6f',
    kind: 'feature',
    complexity: 3,
    state: 'running',
    pausedReason: null,
    start: 'now',
    startAt: null,
    slot: 'edit',
    plan: {
      title: 'Add the moonlit door',
      summary: 'Add a door to the forest room.',
      scope: { included: ['door'], excluded: [] },
      tickets: [
        {
          key: 'OGM-TEST',
          skills: [],
          dependsOn: [],
          acceptanceCriteria: ['The door opens.'],
        },
      ],
    },
    reservation: { amountMicroUsd: 4_000_000, sizeClass: 'medium', confidence: 'low' },
    hardCapMicroUsd: 4_000_000,
    usageMicroUsd: 1_500_000,
    aiurRepo: null,
    aiurIssueNumber: 57,
    aiurSpendCapMicroUsd: null,
    idempotencyKey: null,
    createdAt: '2026-11-01T09:00:00Z',
    updatedAt: '2026-11-01T09:01:00Z',
    terminalAt: null,
    stage: 'building',
    stageText: 'Building',
    progressPercent: 25,
    ...overrides,
  };
}
