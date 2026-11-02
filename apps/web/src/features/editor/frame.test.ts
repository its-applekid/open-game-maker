import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GameFrameOptions } from '@gm/host';
import type { DesignDoc, GameManifest } from '@ogm/contracts';

import { mountGameFrame } from './frame';

const manifest = {
  id: 'cellar',
  title: 'Goblin Cellar',
  inputs: { actions: {} },
} as GameManifest;

afterEach(() => {
  document.body.replaceChildren();
});

describe('game frame adapter', () => {
  it('mounts through @gm/host, forwards mode, and counts rejected origins', () => {
    const container = document.createElement('div');
    document.body.append(container);
    let frameOptions: GameFrameOptions | undefined;
    const frame = {
      bridge: { dropped: 2 },
      on: vi.fn(() => vi.fn()),
      setMode: vi.fn(),
      setSettings: vi.fn(),
      send: vi.fn(),
      dispose: vi.fn(),
    };
    const states: Array<{ bridgeState: string; dropped: number }> = [];

    const controller = mountGameFrame({
      container,
      gamesOrigin: 'http://127.0.0.1:10001',
      gameId: 'game',
      buildId: 'build',
      mode: 'play',
      design: { rev: 4, doc: {} as DesignDoc },
      create: (options) => {
        frameOptions = options;
        return frame;
      },
      onState: (state) => states.push({ bridgeState: state.bridgeState, dropped: state.dropped }),
    });

    expect(frameOptions).toMatchObject({
      gamesOrigin: 'http://127.0.0.1:10001',
      gameId: 'game',
      buildId: 'build',
      build: 'draft',
      mode: 'play',
      readyTimeoutMs: 10_000,
    });
    frameOptions?.onReady?.(manifest, []);
    controller.setMode('edit');
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://attacker.example' }));

    expect(frame.setMode).toHaveBeenCalledWith('edit');
    expect(frame.send).toHaveBeenCalledWith('design.apply', { rev: 4, doc: {}, patches: [] });
    expect(controller.state()).toMatchObject({ bridgeState: 'ready', manifest, dropped: 3 });
    expect(states.at(-1)).toEqual({ bridgeState: 'ready', dropped: 3 });

    controller.pick(0.25, 0.75);
    controller.select(['e_01BX5ZZKBKACTAV9WEVGEMMVRZ']);
    controller.validatePlacement('skeleton', { position: [2, 0, 3] });
    controller.pause();
    controller.resume();
    controller.restoreSave({ saveSchemaVersion: 1, data: { room: 'crypt' } });
    expect(frame.send).toHaveBeenCalledWith('editor.pick', { x: 0.25, y: 0.75 });
    expect(frame.send).toHaveBeenCalledWith('editor.select', { ids: ['e_01BX5ZZKBKACTAV9WEVGEMMVRZ'] });
    expect(frame.send).toHaveBeenCalledWith('editor.validatePlacement', {
      prefab: 'skeleton',
      pose: { position: [2, 0, 3] },
    });
    expect(frame.send).toHaveBeenCalledWith('lifecycle.pause', {});
    expect(frame.send).toHaveBeenCalledWith('lifecycle.resume', {});
    expect(frame.send).toHaveBeenCalledWith('save.restore', {
      saveSchemaVersion: 1,
      data: { room: 'crypt' },
    });

    controller.dispose();
    controller.dispose();
    expect(frame.dispose).toHaveBeenCalledOnce();
  });

  it('surfaces the host readiness timeout as a retryable error state', () => {
    const container = document.createElement('div');
    let frameOptions: GameFrameOptions | undefined;
    const controller = mountGameFrame({
      container,
      gamesOrigin: 'http://127.0.0.1:10001',
      gameId: 'game',
      buildId: 'build',
      mode: 'play',
      design: { rev: 0, doc: {} as DesignDoc },
      create: (options) => {
        frameOptions = options;
        return {
          bridge: { dropped: 0 },
          on: vi.fn(() => vi.fn()),
          setMode: vi.fn(),
          setSettings: vi.fn(),
          send: vi.fn(),
          dispose: vi.fn(),
        };
      },
    });

    frameOptions?.onError?.({ code: 'ready-timeout', message: 'game did not become ready in time' });

    expect(controller.state()).toMatchObject({
      bridgeState: 'error',
      error: 'game did not become ready in time',
    });
  });
});
