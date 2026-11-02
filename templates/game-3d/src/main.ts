import { boot, RuntimeImpl } from '@gm/sdk/core';
import { pickTier } from '@gm/sdk/assets';
import { createRig, RigSet, type ThreeCameraRig } from '@gm/sdk/camera';
import { createRenderer, type RendererHandle } from '@gm/sdk/three';
import { SDK_PROTOCOL } from '@ogm/contracts/bridge';

import { createGame, type GameSave, type LevelDesign } from './game.js';
import { createScene, type SceneHandle } from './scene.js';

declare const __GM_BUILD__: 'draft' | 'test' | 'published';

function installStandaloneHost(): () => void {
  if (window.parent !== window) return () => undefined;
  let port: MessagePort | undefined;
  const onHello = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin || typeof event.data !== 'string') return;
    let message: { t?: string; payload?: { manifest?: unknown } };
    try {
      message = JSON.parse(event.data) as typeof message;
    } catch {
      return;
    }
    if (message.t !== 'hello' || !message.payload?.manifest) return;
    window.removeEventListener('message', onHello);
    const channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = () => undefined;
    port.start();
    window.postMessage(
      JSON.stringify({
        v: 1,
        id: 'template-host-hello',
        t: 'hello',
        payload: { protocol: SDK_PROTOCOL, capabilities: [], mode: 'test', build: __GM_BUILD__, playerIndex: 0 },
      }),
      window.location.origin,
      [channel.port2],
    );
  };
  window.addEventListener('message', onHello);
  return () => {
    window.removeEventListener('message', onHello);
    port?.close();
  };
}

async function start() {
  document.documentElement.dataset.bootStage = 'handshake';
  const closeStandaloneHost = installStandaloneHost();
  let runtime: RuntimeImpl<LevelDesign, GameSave> | undefined;
  let rendererHandle: RendererHandle | undefined;
  let sceneHandle: SceneHandle | undefined;
  let cameraRigs: RigSet | undefined;
  let stopViewport: (() => void) | undefined;
  let stopPlayers: (() => void) | undefined;
  let onWindowResize: (() => void) | undefined;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    closeStandaloneHost();
    stopViewport?.();
    stopPlayers?.();
    if (onWindowResize) window.removeEventListener('resize', onWindowResize);
    cameraRigs?.dispose();
    sceneHandle?.dispose();
    rendererHandle?.dispose();
  };

  try {
    const controller = createGame();
    runtime = (await boot(controller.module, {
      build: __GM_BUILD__,
      headless: true,
      hostOrigin: window.location.origin,
    })) as RuntimeImpl<LevelDesign, GameSave>;
    runtime.hooks.ready = false;
    document.documentElement.dataset.bootStage = 'runtime';

    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    if (!canvas) throw new Error('game canvas is missing');
    rendererHandle = createRenderer(canvas, {
      tier: pickTier(),
      preserveDrawingBuffer: __GM_BUILD__ === 'test',
      onContextLost: () => {
        runtime?.clock.pause();
        runtime?.instance.pause();
      },
    });
    sceneHandle = createScene(controller.design());
    cameraRigs = new RigSet(
      () =>
        createRig(controller.module.manifest.view, '3d', {
          three: {
            scene: sceneHandle!.scene,
            viewport: () => ({ width: canvas.width, height: canvas.height }),
          },
        }),
      undefined,
      runtime.localPlayerIndex,
    );
    const attachedPlayers = new Set<number>();
    const attachPlayers = () => {
      for (const player of Object.values(controller.state().players)) {
        if (attachedPlayers.has(player.playerIndex)) continue;
        const id = player.id;
        cameraRigs?.attach(player.playerIndex, {
          position: () => controller.state().players[id]?.position ?? [0, 0, 0],
        });
        attachedPlayers.add(player.playerIndex);
      }
    };
    attachPlayers();
    sceneHandle.setCamera((cameraRigs.active as ThreeCameraRig).camera);
    runtime.attachInput({
      canvas,
      mapping: cameraRigs.active.inputMapping,
      mapFrame: (frame) => (cameraRigs?.for(frame.playerIndex) as ThreeCameraRig | undefined)?.mapInput(frame) ?? frame,
    });
    runtime.onStep((dt, frames) => {
      attachPlayers();
      cameraRigs?.update(dt, frames);
      if (cameraRigs) sceneHandle?.setCamera((cameraRigs.active as ThreeCameraRig).camera);
    });
    stopPlayers = runtime.onNet((type, payload) => {
      if (type !== 'net.players') return;
      const local = (payload as { local?: unknown }).local;
      if (typeof local === 'number') cameraRigs?.setLocalPlayerIndex(local);
    });
    controller.attachScene(sceneHandle);
    document.documentElement.dataset.bootStage = 'physics';
    await controller.attachPhysics(runtime);
    runtime.setRenderInfoProvider(rendererHandle.info);

    const resize = (width: number, height: number, dpr: number) => {
      rendererHandle?.resize(width, height, dpr);
      sceneHandle?.resize(width, height);
    };
    const viewport = runtime.host.viewport.current();
    resize(viewport.w || window.innerWidth, viewport.h || window.innerHeight, viewport.dpr || window.devicePixelRatio);
    stopViewport = runtime.host.viewport.onChange((next) => resize(next.w, next.h, next.dpr));
    onWindowResize = () => resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
    window.addEventListener('resize', onWindowResize);

    runtime.onFrame(() => {
      sceneHandle?.sync(controller.state());
      if (rendererHandle && sceneHandle) rendererHandle.renderer.render(sceneHandle.scene, sceneHandle.camera);
    });
    sceneHandle.sync(controller.state());
    const initialTick = runtime.clock.tick;
    cameraRigs.update(
      runtime.clock.dt,
      [...attachedPlayers].map((playerIndex) => ({
        playerIndex,
        tick: initialTick,
        source: 'keyboard' as const,
        actions: {},
      })),
    );
    document.documentElement.dataset.bootStage = 'compile';
    await rendererHandle.compile(sceneHandle.scene, sceneHandle.camera);
    runtime.render();
    runtime.hooks.ready = true;
    document.documentElement.dataset.bootStage = 'ready';
    if (__GM_BUILD__ !== 'test') runtime.startLiveLoop();
    runtime.addCleanup(cleanup);
  } catch (error) {
    try {
      runtime?.dispose();
    } catch {
      // Preserve the startup error; resource cleanup below remains best effort.
    }
    cleanup();
    throw error;
  }
}

void start().catch((error: unknown) => {
  document.documentElement.dataset.bootStage = `error:${String(error)}`;
  throw error;
});
