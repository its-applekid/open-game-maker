import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LeaseResult } from './api';
import { LeaseController } from './lease';

afterEach(() => {
  vi.useRealTimers();
});

function ok(): LeaseResult {
  return { ok: true, lease: { token: 4, expiresAt: '2026-11-02T03:00:00.000Z' } };
}

describe('lease controller', () => {
  it('heartbeats every 15 seconds and releases exactly once', async () => {
    vi.useFakeTimers();
    const api = {
      acquire: vi.fn(async () => ok()),
      heartbeat: vi.fn(async () => ok()),
      release: vi.fn(async () => ok()),
    };
    const controller = new LeaseController({ api, heartbeatMs: 15_000, onLost: vi.fn() });

    await controller.start();
    await vi.advanceTimersByTimeAsync(30_000);
    await controller.stop();
    await controller.stop();

    expect(api.heartbeat).toHaveBeenCalledTimes(2);
    expect(api.release).toHaveBeenCalledOnce();
  });

  it('stops heartbeats and reports lease loss after a 423', async () => {
    vi.useFakeTimers();
    const onLost = vi.fn();
    const api = {
      acquire: vi.fn(async () => ok()),
      heartbeat: vi.fn(async () => ({ ok: false as const, kind: 'lease-lost' as const, holder: 'other-session' })),
      release: vi.fn(async () => ok()),
    };
    const controller = new LeaseController({ api, heartbeatMs: 15_000, onLost });

    await controller.start();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(api.heartbeat).toHaveBeenCalledOnce();
    expect(onLost).toHaveBeenCalledWith('other-session');
  });
});
