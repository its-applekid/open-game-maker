import { boot, type BuildKind } from '@gm/sdk/core';
import { defaultInputMapping } from '@gm/sdk/camera';

import { connectPhaserLifecycle, game, getGameContext } from './game.js';
import { installStandaloneHost } from './standalone.js';

declare const __GM_BUILD__: BuildKind;

const requestedBuild = new URLSearchParams(location.search).get('build');
const build: BuildKind = requestedBuild === 'published' ? 'published' : __GM_BUILD__;
installStandaloneHost(build);

async function main(): Promise<void> {
  const runtime = await boot(game, {
    hostOrigin: window.parent === window ? location.origin : undefined,
    build,
    headless: build === 'test',
  });
  runtime.hooks.ready = false;
  runtime.onStep((dt, frames) => getGameContext().advance(dt, frames));

  const [{ bindLifecycle, createPhaserGame }, { Boot }, { Level }] = await Promise.all([
    import('@gm/sdk/phaser'),
    import('./scenes/Boot.js'),
    import('./scenes/Level.js'),
  ]);

  const wrapper = await createPhaserGame(runtime, {
    parent: document.body,
    presentation: game.manifest.presentation,
    scenes: [Boot, Level],
    test: build === 'test',
    renderer: 'canvas',
  });
  runtime.attachInput({
    canvas: wrapper.game.canvas,
    mapping: defaultInputMapping(game.manifest.view),
  });
  connectPhaserLifecycle(bindLifecycle(runtime, wrapper.game, 'level'));
  runtime.setRenderInfoProvider(wrapper.info);
  for (let frame = 0; frame < 600 && !wrapper.game.scene.isActive('level'); frame += 1) {
    wrapper.renderOnce();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  if (!wrapper.game.scene.isActive('level')) throw new Error('level scene did not become active');
  wrapper.renderOnce();
  runtime.hooks.ready = true;
}

void main();
