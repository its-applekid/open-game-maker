import type { HostApi } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { DEFAULT_DESIGN, createGame } from '../src/game.js';

const host = { input: { on: () => () => undefined } } as unknown as HostApi;

// A room watcher's Follow/Free toggle arrives as `editor.camera`; until one does, the manifest rig stays in charge.
describe('editor.camera in the 3D template', () => {
  async function mounted() {
    const controller = createGame();
    const instance = await controller.module.mount(host, structuredClone(DEFAULT_DESIGN));
    return { controller, instance };
  }

  it('keeps the manifest rig until a command arrives, then records follow and free', async () => {
    const { controller, instance } = await mounted();
    expect(controller.camera()).toBeUndefined();
    instance.setCamera!('free');
    expect(controller.camera()).toEqual({ mode: 'free', target: undefined });
    instance.setCamera!('follow');
    expect(controller.camera()).toEqual({ mode: 'follow', target: undefined });
  });

  it('follows the default player or a named spawn where they are now', async () => {
    const { controller, instance } = await mounted();
    const saved = instance.serialize();
    saved.data.players.player_0!.position = [2, 1, -4];
    instance.restore(saved);
    expect(controller.position()).toEqual([2, 1, -4]);

    instance.setCamera!('follow', 'spawn_01K8ZTEMP00000000000000002');
    expect(controller.position('spawn_01K8ZTEMP00000000000000002')).toEqual([3, 0, 0]);
  });

  // A followed player can leave the room; the watcher's camera must fall back to the default player, not the origin.
  it('follows the default player once the followed target is gone', async () => {
    const { controller, instance } = await mounted();
    const saved = instance.serialize();
    saved.data.players.player_0!.position = [2, 1, -4];
    instance.restore(saved);
    expect(controller.followPosition('player_9')).toEqual([2, 1, -4]);
    expect(controller.followPosition('spawn_01K8ZTEMP00000000000000002')).toEqual([3, 0, 0]);
  });

  it('rejects an unknown target without changing the camera', async () => {
    const { controller, instance } = await mounted();
    instance.setCamera!('free');
    expect(() => instance.setCamera!('follow', 'missing')).toThrow('unknown camera target missing');
    expect(controller.camera()?.mode).toBe('free');
  });
});
