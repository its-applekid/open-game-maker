import type { TriageClaim } from '@ogm/contracts';
import type { ReplayOptions } from '@ogm/gm-verify';
import { existsSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { createWorker, type RepairApi } from '../src/worker.js';

const claim: TriageClaim = {
  reportId: 'r_10000000-0000-4000-8000-000000000001',
  jobId: 'j_10000000-0000-4000-8000-000000000001',
  gameId: 'g_10000000-0000-4000-8000-000000000001',
  buildHash: 'a'.repeat(64),
  route: 'game_repair',
  bundleUrl: 'https://private.example.test/bundle?token=SECRET',
};

function api(): RepairApi & { complete: ReturnType<typeof vi.fn> } {
  return {
    claim: vi.fn(async () => claim),
    uploadDiagnostics: vi.fn(async () => 'sha256:' + 'b'.repeat(64)),
    findOpen: vi.fn(async () => null),
    complete: vi.fn(async (_reportId, value) => value),
  };
}

describe('repair worker', () => {
  it('stores an oversized bundle without replaying or filing work', async () => {
    const current = api();
    const runReplay = vi.fn();
    const fetch = vi.fn(async () => new Response(new Uint8Array(200 * 1024 + 1)));
    const worker = createWorker({
      api: current,
      config: { attempts: 2, reservationFraction: 0.333, wallClockMinutes: 10, pollMs: 5000 },
      gamesRoot: '/games',
      fetch,
      replay: runReplay,
      log: vi.fn(),
    });

    await expect(worker.runOnce()).resolves.toBe(true);
    expect(runReplay).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(claim.bundleUrl, { signal: expect.any(AbortSignal) });
    expect(current.complete).toHaveBeenCalledWith(claim.reportId, {
      status: 'stored',
      reason: 'bundle_too_large',
    });
  });

  it('survives a fetch failure without logging its signed URL or payload', async () => {
    const current = api();
    const log = vi.fn();
    const worker = createWorker({
      api: current,
      config: { attempts: 2, reservationFraction: 0.333, wallClockMinutes: 10, pollMs: 5000 },
      gamesRoot: '/games',
      fetch: vi.fn(async () => {
        throw new Error('request failed for token=SECRET');
      }),
      replay: vi.fn(),
      log,
    });

    await expect(worker.runOnce()).resolves.toBe(true);
    expect(current.complete).toHaveBeenCalledWith(claim.reportId, {
      status: 'stored',
      reason: 'bundle_fetch_failed',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('SECRET');
    expect(JSON.stringify(log.mock.calls)).not.toContain(claim.bundleUrl);
  });

  it('allows only one claim at a time', async () => {
    const current = api();
    let release!: () => void;
    const held = new Promise<Response>((resolve) => {
      release = () => resolve(new Response(new Uint8Array(200 * 1024 + 1)));
    });
    const worker = createWorker({
      api: current,
      config: { attempts: 2, reservationFraction: 0.333, wallClockMinutes: 10, pollMs: 5000 },
      gamesRoot: '/games',
      fetch: vi.fn(async () => held),
      replay: vi.fn(),
      log: vi.fn(),
    });

    const first = worker.runOnce();
    await vi.waitFor(() => expect(current.claim).toHaveBeenCalledOnce());
    await expect(worker.runOnce()).resolves.toBe(false);
    release();
    await first;
    expect(current.claim).toHaveBeenCalledOnce();
  });

  it('keeps private promise content and final replay state out of the triage completion', async () => {
    const current = api();
    const bundle = {
      seed: 7,
      keyframe: { tick: 0, state: { save: 'PRIVATE_STATE' } },
      actions: [{ tick: 11, action: 'crash', phase: 'down' }],
      errors: [{ message: 'TypeError: planted crash' }],
      probes: { alive: true },
    };
    const runReplay = vi.fn(async (_bundle: unknown, options: ReplayOptions) => ({
      class: 'reproduces_with_error' as const,
      errorsSeen: ['TypeError: planted crash'],
      finalState: { save: 'PRIVATE_STATE', alive: false },
      finalProbes: { alive: false },
      scriptPath: `${options.outDir}/replay.json`,
      durationMs: 22,
    }));
    const worker = createWorker({
      api: current,
      config: { attempts: 2, reservationFraction: 0.333, wallClockMinutes: 10, pollMs: 5000 },
      gamesRoot: '/games',
      fetch: vi.fn(async () => new Response(JSON.stringify(bundle))),
      replay: runReplay,
      log: vi.fn(),
    });

    await expect(worker.runOnce()).resolves.toBe(true);
    // Replay files hold the creator's keyframe; none may outlive the claim on the worker host.
    const outDir = vi.mocked(runReplay).mock.calls[0]?.[1].outDir;
    expect(outDir).toEqual(expect.any(String));
    expect(existsSync(outDir!)).toBe(false);
    const diagnostics = vi.mocked(current.uploadDiagnostics).mock.calls[0]?.[1];
    expect(diagnostics).toMatchObject({
      finalState: { save: 'PRIVATE_STATE', alive: false },
      promise: { spec: expect.stringContaining('promiseTest'), replay: expect.stringContaining('PRIVATE_STATE') },
      probes: { before: { alive: true }, after: { alive: false } },
    });
    const completion = vi.mocked(current.complete).mock.calls.at(-1)?.[1];
    expect(completion).toMatchObject({
      status: 'triaged',
      result: {
        replay: { class: 'reproduces_with_error', durationMs: 22 },
        promise: { specPath: expect.any(String), replayPath: expect.any(String) },
      },
    });
    expect(JSON.stringify(completion)).not.toContain('PRIVATE_STATE');
    expect(JSON.stringify(completion)).not.toContain('promiseTest');
  });

  it('logs a transient claim failure without stopping the next poll', async () => {
    const current = api();
    vi.mocked(current.claim).mockRejectedValueOnce(new Error('token=SECRET')).mockResolvedValueOnce(null);
    const log = vi.fn();
    const worker = createWorker({
      api: current,
      config: { attempts: 2, reservationFraction: 0.333, wallClockMinutes: 10, pollMs: 5000 },
      gamesRoot: '/games',
      fetch: vi.fn(),
      replay: vi.fn(),
      log,
    });

    await expect(worker.runOnce()).resolves.toBe(false);
    await expect(worker.runOnce()).resolves.toBe(false);
    expect(current.claim).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith({ event: 'repair-claim-failed', error: 'Error' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('SECRET');
  });
});
