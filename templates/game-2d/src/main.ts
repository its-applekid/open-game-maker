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
    hostOrigin: location.origin,
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
  });
  runtime.attachInput({
    canvas: wrapper.game.canvas,
    mapping: defaultInputMapping(game.manifest.view),
  });
  connectPhaserLifecycle(bindLifecycle(runtime, wrapper.game, 'level'));
  runtime.setRenderInfoProvider(wrapper.info);
  wrapper.renderOnce();
  runtime.hooks.ready = true;
}

void main();
