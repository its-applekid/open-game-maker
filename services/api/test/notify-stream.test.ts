import type { Principal } from '@ogm/contracts';
import { describe, expect, it, vi } from 'vitest';

import { getNotifyRuntime } from '../src/notify/routes.js';
import { insertNotification } from '../src/notify/store.js';
import { createStreamHub } from '../src/notify/stream.js';
import { makeApp } from './helpers.js';

const user = {
  kind: 'user',
  userId: 'u_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e03',
  displayName: 'One',
  familyId: 'f_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e02',
  platformRole: 'none',
  capability: 'creator',
} as const satisfies Principal;

async function setup() {
  const result = await makeApp();
  result.deps.registry.principalResolvers.push(async (c) => (c.req.header('x-test-user') ? user : null));
  return result;
}

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('SSE read timed out')), 500));
  const result = await Promise.race([reader.read(), timeout]);
  return new TextDecoder().decode(result.value);
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  complete: (text: string) => boolean,
): Promise<string> {
  let text = '';
  while (!complete(text)) text += await readChunk(reader);
  return text;
}

describe('notification stream hub', () => {
  it('closes the oldest stream when a sixth stream attaches for one user', async () => {
    const hub = createStreamHub();
    const closed: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      hub.attach(user.userId, {
        write: async () => {},
        close: async () => {
          closed.push(index);
        },
      });
    }
    await Promise.resolve();
    expect(closed).toEqual([0]);
    expect(hub.size()).toBe(5);
  });

  it('refuses a new user at the process cap while still allowing oldest-per-user replacement', async () => {
    const hub = createStreamHub({ maxPerUser: 1, maxTotal: 1 });
    let closed = 0;
    const writer = () => ({
      write: async () => {},
      close: async () => {
        closed += 1;
      },
    });
    hub.attach(user.userId, writer());
    expect(hub.canAttach('u_another')).toBe(false);
    expect(hub.canAttach(user.userId)).toBe(true);
    hub.attach(user.userId, writer());
    await Promise.resolve();
    expect(closed).toBe(1);
    expect(hub.size()).toBe(1);
  });
});

describe('GET /api/v1/notifications/stream', () => {
  it('writes a live frame and unregisters when the client cancels', async () => {
    const { app, deps } = await setup();
    const response = await app.request('/api/v1/notifications/stream', { headers: { 'x-test-user': 'one' } });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();

    deps.events.emit('notify', {
      kind: 'build.done',
      userIds: [user.userId],
      gameId: 'g_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e01',
      jobId: 'j_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e6f',
      buildId: 'build-1',
      ok: true,
    });

    const frame = await readChunk(reader);
    expect(frame).toMatch(/^id: n_/);
    expect(frame).toContain('\nevent: build.done\n');
    expect(frame).toContain('\ndata: {');
    await reader.cancel();
    await vi.waitFor(() => expect(getNotifyRuntime(deps).stream.size()).toBe(0));
  });

  it('replays only rows newer than Last-Event-ID in creation order', async () => {
    const { app, deps } = await setup();
    const first = insertNotification(
      deps.sqlite,
      { userId: user.userId, kind: 'build.done', title: 'first', body: 'first' },
      { id: 'n_00000000-0000-4000-8000-000000000001', now: new Date('2026-11-01T12:00:00.000Z') },
    );
    const second = insertNotification(
      deps.sqlite,
      { userId: user.userId, kind: 'job.started', title: 'second', body: 'second' },
      { id: 'n_00000000-0000-4000-8000-000000000002', now: new Date('2026-11-01T12:00:01.000Z') },
    );
    const third = insertNotification(
      deps.sqlite,
      { userId: user.userId, kind: 'intake.report', title: 'third', body: 'third' },
      { id: 'n_00000000-0000-4000-8000-000000000003', now: new Date('2026-11-01T12:00:01.000Z') },
    );

    const response = await app.request('/api/v1/notifications/stream', {
      headers: { 'last-event-id': first.id, 'x-test-user': 'one' },
    });
    const reader = response.body!.getReader();
    const replay = await readUntil(reader, (text) => text.includes(third.id));
    expect(replay).not.toContain(first.id);
    expect(replay.indexOf(second.id)).toBeLessThan(replay.indexOf(third.id));
    await reader.cancel();

    const sameMillisecondResponse = await app.request('/api/v1/notifications/stream', {
      headers: { 'last-event-id': second.id, 'x-test-user': 'one' },
    });
    const sameMillisecondReader = sameMillisecondResponse.body!.getReader();
    const sameMillisecondReplay = await readUntil(sameMillisecondReader, (text) => text.includes(third.id));
    expect(sameMillisecondReplay).not.toContain(second.id);
    await sameMillisecondReader.cancel();
  });
});
