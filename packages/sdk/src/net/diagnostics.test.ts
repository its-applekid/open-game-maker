import type { GameManifest, MultiplayerHooks } from '@ogm/contracts';
import { describe, expect, it, vi } from 'vitest';

import { encodeBase64, packJson } from './codec.js';
import { EVENT_DELAY_SAMPLES, EventDelayRing } from './diagnostics.js';
import { createNetController, type NetController } from './index.js';

const manifest = { inputs: { actions: {} } } as GameManifest;
const hooks: MultiplayerHooks = {
  spawn() {},
  despawn() {},
  snapshot: () => ({ tick: 0, state: {} }),
  applySnapshot() {},
  hud: () => ({}),
};
const event = (seq: number, value: unknown) => ({
  seq,
  data: encodeBase64(packJson(value, 16_384, 'event')),
});

function controllerAt(clock: { now: number }): NetController {
  return createNetController({
    manifest,
    hooks,
    localPlayerIndex: 0,
    send: vi.fn(),
    acceptInput: vi.fn(),
    syncPlayers: vi.fn(),
    setLocalPlayerIndex: vi.fn(),
    recordEvent: vi.fn(),
    now: () => clock.now,
  });
}

describe('EventDelayRing', () => {
  it('reports the latest sample and the nearest-rank p95', () => {
    const ring = new EventDelayRing();
    for (let delay = 1; delay <= 100; delay += 1) ring.add(delay);

    expect(ring.samples).toBe(100);
    expect(ring.latest).toBe(100);
    /* Nearest rank: ceil(0.95 × 100) = 95, and the samples are 1..100. */
    expect(ring.p95).toBe(95);
  });

  it('evicts the oldest sample once it is full', () => {
    const ring = new EventDelayRing(3);
    ring.add(1);
    ring.add(2);
    ring.add(3);
    ring.add(4);

    expect(ring.samples).toBe(3);
    expect(ring.latest).toBe(4);
  });

  it('ignores a negative or non-finite sample', () => {
    const ring = new EventDelayRing();
    ring.add(5);
    ring.add(-1);
    ring.add(Number.NaN);
    ring.add(Number.POSITIVE_INFINITY);

    expect(ring.samples).toBe(1);
    expect(ring.latest).toBe(5);
  });

  it('reads zero before the first delivery', () => {
    const ring = new EventDelayRing();

    expect(ring.latest).toBe(0);
    expect(ring.p95).toBe(0);
    expect(ring.samples).toBe(0);
    expect(ring.capacity).toBe(EVENT_DELAY_SAMPLES);
  });
});

describe('the event channel diagnostics', () => {
  it('reads zero before anything is delivered', () => {
    const controller = controllerAt({ now: 0 });

    expect(controller.diagnostics.eventDelayMs).toBe(0);
    expect(controller.diagnostics.eventDelayP95Ms).toBe(0);
    expect(controller.diagnostics.droppedBytes).toBe(0);
  });

  it('records how long an event waited for a missing predecessor', () => {
    const clock = { now: 0 };
    const controller = controllerAt(clock);
    const received: unknown[] = [];
    controller.net.onEvent((value) => received.push(value));

    /* Event 2 arrives first and has to wait for event 1, which lands 40 ms later. */
    controller.handleMessage('net.event', event(2, 'second'));
    clock.now = 40;
    controller.handleMessage('net.event', event(1, 'first'));

    expect(received).toEqual(['first', 'second']);
    expect(controller.diagnostics.eventDelayMs).toBe(40);
    expect(controller.diagnostics.eventDelayP95Ms).toBe(40);
  });

  it('adds the bytes of an event the codec refused to droppedBytes', () => {
    const controller = controllerAt({ now: 0 });

    controller.handleMessage('net.event', { seq: 1, data: encodeBase64(new Uint8Array(17_000)) });

    expect(controller.diagnostics.oversized).toBe(1);
    expect(controller.diagnostics.dropped).toBe(1);
    expect(controller.diagnostics.droppedBytes).toBe(17_000);
  });
});
