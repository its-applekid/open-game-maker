import type { NotificationTrigger } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { createAppEvents } from '../src/app/events.js';

const trigger: NotificationTrigger = {
  kind: 'job.started',
  userIds: ['u_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e03'],
  gameId: 'g_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e01',
  jobId: 'j_8f1c2a4e-5b6d-4c7e-9f00-1a2b3c4d5e6f',
};

describe('app events', () => {
  it('delivers notify to a subscriber', () => {
    const events = createAppEvents();
    const seen: NotificationTrigger[] = [];
    events.on('notify', (event) => seen.push(event));
    events.emit('notify', trigger);
    expect(seen).toEqual([trigger]);
  });

  it('keeps delivering after one subscriber throws, and logs it', () => {
    const lines: Record<string, unknown>[] = [];
    const events = createAppEvents((line) => lines.push(line));
    const seen: string[] = [];
    events.on('budget.changed', () => {
      throw new Error('bad subscriber');
    });
    events.on('budget.changed', (event) => seen.push(event.userId));
    expect(() => events.emit('budget.changed', { familyId: 'f', userId: 'u' })).not.toThrow();
    expect(seen).toEqual(['u']);
    expect(lines).toEqual([expect.objectContaining({ event: 'listener-error', kind: 'budget.changed' })]);
  });

  it('stops delivery after the returned off is called and keeps kinds apart', () => {
    const events = createAppEvents();
    const seen: string[] = [];
    const off = events.on('job.changed', (event) => seen.push(event.state));
    events.emit('job.changed', { jobId: 'j', gameId: 'g', familyId: 'f', state: 'running' });
    events.emit('notify', trigger);
    off();
    events.emit('job.changed', { jobId: 'j', gameId: 'g', familyId: 'f', state: 'done' });
    expect(seen).toEqual(['running']);
  });
});
