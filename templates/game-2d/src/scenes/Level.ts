import type { CameraRig } from '@ogm/contracts';
import { createRig, RigSet } from '@gm/sdk/camera';
import Phaser from 'phaser';

import { game, getGameContext, type TemplateContext } from '../game.js';
import { GROUND_Y, PLAYER_HEIGHT, PLAYER_WIDTH } from '../state.js';

export class Level extends Phaser.Scene {
  private readonly playerViews = new Map<number, Phaser.GameObjects.Rectangle>();
  private cameraRig: CameraRig | undefined;
  private cameraRigs: RigSet | undefined;

  constructor() {
    super('level');
  }

  create(): void {
    const context = getGameContext();
    this.playerViews.clear();
    const levelWidth = context.design.globals['level.width'];
    this.data.set('level.bounds', { x: 0, y: 0, width: levelWidth, height: 480 });

    this.add.rectangle(levelWidth / 2, GROUND_Y + 20, levelWidth, 40, 0x303746);
    for (const platform of context.state.platforms) {
      this.add.rectangle(platform.x, platform.y + platform.height / 2, platform.width, platform.height, 0x727c91);
    }

    this.syncViews(context);
    this.cameraRigs?.dispose();
    this.cameraRigs = new RigSet(() =>
      createRig(game.manifest.view, '2d', { phaser: { scene: this, camera: this.cameras.main } }),
    );
    context.view = {
      screenToWorld: (nx, ny) => {
        const point = this.cameras.main.getWorldPoint(nx * this.cameras.main.width, ny * this.cameras.main.height);
        return [point.x, point.y];
      },
      worldToScreen: (point) => this.cameraRig?.worldToScreen(point) ?? null,
    };
    const followed = context.state.players.get(0);
    if (followed) {
      this.cameraRig = this.cameraRigs.attach(0, {
        position: () => {
          const player = getGameContext().state.players.get(0);
          return player ? [player.pos.x, player.pos.y, 0] : [0, 0, 0];
        },
      });
    }
  }

  update(_time: number, delta: number): void {
    const context = getGameContext();
    this.syncViews(context);
    this.cameraRigs?.update(delta / 1000, [
      {
        playerIndex: 0,
        tick: context.state.tick,
        source: 'keyboard',
        actions: {},
      },
    ]);
  }

  private syncViews(context: TemplateContext): void {
    for (const [playerIndex, player] of context.state.players) {
      let view = this.playerViews.get(playerIndex);
      if (!view) {
        view = this.add.rectangle(player.pos.x, player.pos.y, PLAYER_WIDTH, PLAYER_HEIGHT, 0x56c7ff);
        view.setOrigin(0.5, 0);
        this.playerViews.set(playerIndex, view);
      }
      view.setPosition(player.pos.x, player.pos.y);
    }

    for (const [playerIndex, view] of this.playerViews) {
      if (context.state.players.has(playerIndex)) continue;
      view.destroy();
      this.playerViews.delete(playerIndex);
    }
  }
}
