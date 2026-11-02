import type { CameraRig, GameManifest, MultiplayerHooks } from '@ogm/contracts';
import { describe, expect, it, vi } from 'vitest';

import { bindLocalPlayer } from './bind.js';
import { createNetController } from './index.js';

describe('local player net binding', () => {
  it('reattaches the camera on identity changes and refreshes HUD each frame', () => {
    const attach = vi.fn();
    const hud = vi.fn((playerIndex: number) => ({ playerIndex }));
    const updateHud = vi.fn();
    let render: (() => void) | undefined;
    const controller = createNetController({
      manifest: { inputs: { actions: {} } } as GameManifest,
      hooks: {
        spawn() {},
        despawn() {},
        snapshot: () => ({ tick: 0, state: {} }),
        applySnapshot() {},
        hud,
      } satisfies MultiplayerHooks,
      localPlayerIndex: 0,
      send: vi.fn(),
      acceptInput: vi.fn(),
      syncPlayers: vi.fn(),
      setLocalPlayerIndex: vi.fn(),
      recordEvent: vi.fn(),
      now: () => 0,
    });
    const target = { position: () => [0, 0, 0] as [number, number, number] };
    const stop = bindLocalPlayer(controller.net, {
      rig: { attach } as unknown as CameraRig,
      target,
      hud,
      updateHud,
      onFrame: (callback) => {
        render = callback;
        return () => {
          render = undefined;
        };
      },
    });

    expect(attach).toHaveBeenCalledExactlyOnceWith(target, 0);
    expect(updateHud).toHaveBeenLastCalledWith({ playerIndex: 0 });

    controller.handleMessage('net.players', {
      local: 1,
      players: [
        { playerIndex: 0, name: 'Host', connected: true },
        { playerIndex: 1, name: 'Peer', connected: true },
      ],
    });
    render?.();

    expect(attach).toHaveBeenLastCalledWith(target, 1);
    expect(updateHud).toHaveBeenLastCalledWith({ playerIndex: 1 });
    expect(hud).toHaveBeenLastCalledWith(1);

    controller.handleMessage('net.role', { role: 'peer' });
    expect(attach).toHaveBeenCalledTimes(3);

    stop();
    expect(render).toBeUndefined();
  });
});
