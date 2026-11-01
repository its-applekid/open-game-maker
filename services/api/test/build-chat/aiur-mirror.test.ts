import { describe, expect, it, vi } from 'vitest';

import { createMirror, MIRROR_FAILED_TEXT } from '../../src/build-chat/aiur-mirror.js';
import { getChatRow, insertChatRow, listSince } from '../../src/build-chat/store.js';
import { chatJob, jobTable, JOB_ID, makeChatDeps, type FakeAiur } from './setup.js';

function fakeAiur(message: FakeAiur['message'] = vi.fn().mockResolvedValue({ request_id: 'r1' })) {
  return { message: vi.fn(message), progress: vi.fn() } as unknown as FakeAiur & {
    message: ReturnType<typeof vi.fn>;
  };
}

function setup(jobs = jobTable(chatJob()), client = fakeAiur()) {
  const deps = makeChatDeps(jobs, client);
  const publish = vi.fn();
  const mirror = createMirror({
    sqlite: deps.sqlite,
    jobs: () => deps.registry.chatJobs,
    clientFor: () => deps.registry.aiurClientFor,
    publish,
    log: deps.log,
    sleep: async () => {},
  });
  const post = (text: string) =>
    insertChatRow(deps.sqlite, { jobId: JOB_ID, actor: 'creator', kind: 'text', text, mirrorState: 'pending' }).row!;
  return { deps, mirror, client, publish, post, jobs };
}

describe('creator to aiur mirror', () => {
  it('sends the creator text to the job ticket with the row id as message id', async () => {
    const { mirror, client, post, deps } = setup();
    const row = post('make the door red');
    await mirror.mirror(row.id);
    expect(client.message).toHaveBeenCalledWith('142', 'make the door red', row.id);
    expect(getChatRow(deps.sqlite, row.id)?.mirrorState).toBe('sent');
  });

  // A job queued or waiting for a reset has no ticket; the creator's words must still reach the worker later, once.
  it('holds rows until the job has a ticket, then sends each once', async () => {
    const jobs = jobTable(chatJob({ aiur: null, state: 'queued' }));
    const { mirror, client, post, deps } = setup(jobs);
    const first = post('first');
    const second = post('second');
    await mirror.mirror(first.id);
    expect(client.message).not.toHaveBeenCalled();
    expect(getChatRow(deps.sqlite, first.id)?.mirrorState).toBe('pending');

    jobs.byId.set(JOB_ID, chatJob());
    await Promise.all([mirror.flushPending(JOB_ID), mirror.flushPending(JOB_ID)]);
    await mirror.flushPending(JOB_ID);
    expect(client.message.mock.calls.map((call) => call[1])).toEqual(['first', 'second']);
    expect(getChatRow(deps.sqlite, second.id)?.mirrorState).toBe('sent');
  });

  it('gives up after five failures and tells the creator in one system row', async () => {
    const client = fakeAiur(() => Promise.reject(new Error('down')));
    const { mirror, post, deps, publish } = setup(jobTable(chatJob()), client);
    const row = post('hello?');
    await mirror.mirror(row.id);
    expect(client.message).toHaveBeenCalledTimes(5);
    expect(getChatRow(deps.sqlite, row.id)?.mirrorState).toBe('failed');
    const system = listSince(deps.sqlite, JOB_ID, row.seq);
    expect(system).toMatchObject([{ actor: 'system', kind: 'text', text: MIRROR_FAILED_TEXT }]);
    expect(publish).toHaveBeenCalledWith(JOB_ID);
    await mirror.flushPending(JOB_ID);
    expect(client.message).toHaveBeenCalledTimes(5);
  });

  it('recovers when aiur comes back before the last try', async () => {
    const message = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue({ request_id: 'r' });
    const { mirror, post, deps } = setup(jobTable(chatJob()), fakeAiur(message));
    const row = post('retry me');
    await mirror.mirror(row.id);
    expect(message).toHaveBeenCalledTimes(3);
    expect(getChatRow(deps.sqlite, row.id)?.mirrorState).toBe('sent');
  });
});
