import type { TicketProgress } from '@ogm/aiur-client';
import { describe, expect, it, vi } from 'vitest';

import { createProgressPoller } from '../../src/build-chat/progress-poller.js';
import { listSince } from '../../src/build-chat/store.js';
import { chatJob, jobTable, JOB_ID, makeChatDeps, type FakeAiur } from './setup.js';

function progress(events: Record<string, unknown>[], phase: string | null = null): TicketProgress {
  return {
    contract: 'aiur.ticket_progress',
    contract_version: 1,
    issue_identifier: '142',
    repository: null,
    phase: phase === null ? { status: 'unknown' } : { status: 'known', value: phase as 'work' },
    progress: { status: 'unknown' },
    events,
    sources: { activity: 'available' },
    generated_at: '2026-11-01T09:00:00Z',
  };
}

const checkin = (id: number, label: string) => ({
  id,
  type: 'checkin',
  topic: 'ticket.142.agent.progress.checkin',
  label,
  at: `2026-11-01T09:0${id}:00Z`,
});

function setup(read: () => Promise<TicketProgress>) {
  const client = { message: vi.fn(), progress: vi.fn(read) } as unknown as FakeAiur & {
    progress: ReturnType<typeof vi.fn>;
  };
  const deps = makeChatDeps(
    jobTable(chatJob(), chatJob({ jobId: 'j_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e71', aiur: null })),
    client,
  );
  const publish = vi.fn();
  const poller = createProgressPoller({
    sqlite: deps.sqlite,
    jobs: () => deps.registry.chatJobs,
    clientFor: () => deps.registry.aiurClientFor,
    publish,
    log: deps.log,
  });
  return { deps, poller, client, publish };
}

describe('aiur progress poller', () => {
  it('turns each new check-in into one progress row and skips it on the next poll', async () => {
    const { deps, poller, client, publish } = setup(async () =>
      progress([checkin(4, 'Door wired up'), checkin(3, 'Room laid out')]),
    );
    await poller.tick();
    await poller.tick();
    const rows = listSince(deps.sqlite, JOB_ID, 0);
    expect(rows).toMatchObject([
      { actor: 'system', kind: 'progress', text: 'Room laid out', aiurEventId: 3, aiurTicket: '142' },
      { actor: 'system', kind: 'progress', text: 'Door wired up', aiurEventId: 4, at: '2026-11-01T09:04:00Z' },
    ]);
    expect(client.progress).toHaveBeenCalledWith('142', 20);
    expect(client.progress).toHaveBeenCalledTimes(2); // the job without a ticket is never polled
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('adds one row per phase change', async () => {
    let phase = 'work';
    const { deps, poller } = setup(async () => progress([], phase));
    await poller.tick();
    await poller.tick();
    phase = 'review';
    await poller.tick();
    expect(listSince(deps.sqlite, JOB_ID, 0).map((row) => [row.text, row.aiurTopic])).toEqual([
      ['work', 'phase'],
      ['review', 'phase'],
    ]);
  });

  it('stores nothing when aiur fails and still polls on the next tick', async () => {
    let fail = true;
    const { deps, poller } = setup(async () => {
      if (fail) throw new Error('down');
      return progress([checkin(5, 'Back')]);
    });
    await poller.tick();
    expect(listSince(deps.sqlite, JOB_ID, 0)).toEqual([]);
    expect(deps.lines).toContainEqual(expect.objectContaining({ event: 'chat-progress-error', jobId: JOB_ID }));
    fail = false;
    await poller.tick();
    expect(listSince(deps.sqlite, JOB_ID, 0)).toHaveLength(1);
  });
});
