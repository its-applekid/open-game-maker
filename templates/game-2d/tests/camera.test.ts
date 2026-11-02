import type { HostApi } from '@ogm/contracts';
import { describe, expect, it } from 'vitest';

import { cameraView, defaultDesign, game, getGameContext } from '../src/game.js';

// A room watcher's Follow/Free toggle arrives as `editor.camera`; play mode must never be left on a free camera.
describe('editor.camera in the 2D template', () => {
  async function mounted(editing: boolean) {
    const instance = await game.mount({} as HostApi, defaultDesign);
    const context = getGameContext();
    context.editing = () => editing;
    return { instance, context };
  }

  it('follows player 0 by default and switches to the free camera in edit mode', async () => {
    const { instance, context } = await mounted(true);
    const player = context.state.players.get(0)!;
    const follow = cameraView(context);
    expect(follow?.mode === 'follow' && follow.position()).toEqual([player.pos.x, player.pos.y, 0]);

    instance.setCamera!('free');
    expect(cameraView(context)).toEqual({ key: 'free:', mode: 'free' });
    instance.dispose();
  });

  it('tracks a named target as it moves', async () => {
    const { instance, context } = await mounted(true);
    const platform = context.state.platforms[0]!;
    instance.setCamera!('follow', platform.id);
    const view = cameraView(context);
    expect(view?.key).toBe(`follow:${platform.id}`);
    platform.x += 50;
    expect(view?.mode === 'follow' && view.position()).toEqual([platform.x, platform.y, 0]);
    instance.dispose();
  });

  // A followed platform can be deleted by the owner's next edit; the watcher's camera must not jump to the origin.
  it('falls back to player 0 when the followed target is removed', async () => {
    const { instance, context } = await mounted(true);
    const platform = context.state.platforms[0]!;
    instance.setCamera!('follow', platform.id);
    const view = cameraView(context);
    context.state.platforms.splice(0, 1);
    const player = context.state.players.get(0)!;
    expect(view?.mode === 'follow' && view.position()).toEqual([player.pos.x, player.pos.y, 0]);
    instance.dispose();
  });

  it('rejects an unknown target without changing the camera', async () => {
    const { instance, context } = await mounted(true);
    instance.setCamera!('free');
    expect(() => instance.setCamera!('follow', 'missing')).toThrow('unknown camera target missing');
    expect(cameraView(context)?.mode).toBe('free');
    instance.dispose();
  });

  it('ignores a free camera outside edit mode', async () => {
    const { instance, context } = await mounted(false);
    instance.setCamera!('free');
    expect(cameraView(context)?.key).toBe('follow:');
    instance.dispose();
  });
});
