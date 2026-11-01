import type { AiurClient } from '@ogm/aiur-client';
import type { Principal } from '@ogm/contracts';

import type { ChatJob } from '../../src/app/registry.js';
import { makeApp, makeDeps } from '../helpers.js';

export const FIXTURES = new URL('./fixtures/', import.meta.url);
export const JOB_ID = 'j_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e6f';
export const OTHER_JOB_ID = 'j_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e70';
const FAMILY = 'f_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e02';

export const users = {
  owner: {
    kind: 'user',
    userId: 'u_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e03',
    familyId: FAMILY,
    platformRole: 'none',
    capability: 'creator',
  },
  sibling: {
    kind: 'user',
    userId: 'u_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e04',
    familyId: FAMILY,
    platformRole: 'none',
    capability: 'creator',
  },
  player: {
    kind: 'user',
    userId: 'u_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e05',
    familyId: FAMILY,
    platformRole: 'none',
    capability: 'player',
  },
} as const satisfies Record<string, Principal>;

export function chatJob(overrides: Partial<ChatJob> = {}): ChatJob {
  return {
    jobId: JOB_ID,
    gameId: 'g_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e01',
    familyId: FAMILY,
    ownerId: users.owner.userId,
    state: 'running',
    aiur: { daemonSlug: 'game-1', ticket: '142' },
    ...overrides,
  };
}

// A mutable job table standing in for OGM-013's.
export function jobTable(...jobs: ChatJob[]) {
  const byId = new Map(jobs.map((job) => [job.jobId, job]));
  return {
    byId,
    directory: {
      get: async (jobId: string) => byId.get(jobId) ?? null,
      active: async () => [...byId.values()].filter((job) => job.aiur !== null),
    },
  };
}

export type FakeAiur = Pick<AiurClient, 'message' | 'progress'>;

export function makeChatDeps(jobs = jobTable(chatJob()), client?: FakeAiur) {
  const deps = makeDeps();
  deps.registry.chatJobs = jobs.directory;
  if (client) deps.registry.aiurClientFor = () => client;
  return deps;
}

export async function makeChatApp(jobs = jobTable(chatJob()), client?: FakeAiur) {
  const result = await makeApp(makeChatDeps(jobs, client));
  result.deps.registry.principalResolvers.push(async (c) => {
    const user = c.req.header('x-test-user') as keyof typeof users | undefined;
    return user && user in users ? users[user] : null;
  });
  return { ...result, jobs };
}

export const as = (user: keyof typeof users) => ({ 'x-test-user': user });
