import type { AiurClient, Decision, SubscribeEventsOptions } from '@ogm/aiur-client';
import { migrate, openDb } from '@ogm/db';
import { vi } from 'vitest';

import type { FeedDeps } from '../../src/events/index.js';
import type { GameDaemon } from '../../src/fleet/types.js';

export const SLUG = 'castle-run';
export const REPO = 'everdred-games/instance';

export function daemon(slug = SLUG, repo = REPO): GameDaemon {
  return {
    slug,
    repo,
    checkoutPath: `/home/x/.local/share/ogm/daemons/${slug}`,
    unit: `ogm-aiur@${slug}.service`,
    envFile: `/home/x/.config/ogm/env/ogm-aiur@${slug}.env`,
    port: 4101,
    clientToken: 'aiur_token1',
    status: 'running',
  };
}

export function decision(id: string, ticket: string, extra: Partial<Decision> = {}): Decision {
  return {
    decision_id: id,
    version: 1,
    ticket: { identifier: ticket },
    kind: 'direction',
    authority: 'human_required',
    blocking: true,
    reversibility: 'reversible',
    question: 'Which castle wall colour?',
    options: [
      { id: 'grey', label: 'Grey stone' },
      { id: 'red', label: 'Red brick' },
    ],
    recommendation: { option_id: 'grey', reason: 'matches the pack' },
    created_at: '2026-11-01T03:00:00Z',
    decision_status: 'open',
    ...extra,
  };
}

export function fakeClient() {
  return {
    baseUrl: 'http://127.0.0.1:4101',
    issue: vi.fn(async (id: string) => ({ issue_identifier: id, running: { state: 'agent:in-progress' } })),
    progress: vi.fn(async (id: string) => ({ issue_identifier: id, phase: { status: 'known', value: 'work' } })),
    decisions: vi.fn(async (): Promise<Decision[]> => []),
  };
}

export function harness(daemons: GameDaemon[] = [daemon()]) {
  const { sqlite, db } = openDb(':memory:');
  migrate({ sqlite });
  const listed = { daemons };
  const clients = new Map<string, ReturnType<typeof fakeClient>>();
  const clientFor = (gameSlug: string) => {
    if (!clients.has(gameSlug)) clients.set(gameSlug, fakeClient());
    return clients.get(gameSlug) as ReturnType<typeof fakeClient>;
  };
  const subscriptions: { options: SubscribeEventsOptions; resolve: () => void }[] = [];
  const subscribe = vi.fn(
    (_client: AiurClient, options: SubscribeEventsOptions) =>
      new Promise<void>((resolve) => {
        subscriptions.push({ options, resolve });
        options.signal.addEventListener('abort', () => resolve(), { once: true });
      }),
  );
  const jobs = new Map<string, { jobId: string; ticket: string }[]>([[SLUG, [{ jobId: 'j_142', ticket: '142' }]]]);
  const apply = { record: vi.fn(), issue: vi.fn(), progress: vi.fn() };
  const emitted: unknown[] = [];
  const alerts: string[] = [];
  const deps: FeedDeps = {
    db,
    fleet: {
      listDaemons: async (status) => listed.daemons.filter((d) => status === undefined || d.status === status),
      daemonFor: async (gameSlug) => {
        const found = listed.daemons.find((d) => d.slug === gameSlug);
        return found ? { daemon: found, client: clientFor(gameSlug) as unknown as AiurClient } : null;
      },
    },
    activeJobs: (slug) => jobs.get(slug) ?? [],
    apply,
    subscribe,
    emit: (event) => emitted.push(event),
    alert: (message) => alerts.push(message),
    now: () => new Date('2026-11-01T03:12:10Z'),
    intervals: { reconcileMs: 1e9, progressMs: 1e9, issueMs: 1e9, decisionsMs: 1e9 },
  };
  return { db, deps, listed, clientFor, subscribe, subscriptions, jobs, apply, emitted, alerts };
}
