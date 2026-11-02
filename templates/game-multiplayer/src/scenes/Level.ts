import type { CameraRig } from '@ogm/contracts';
import { createRig, RigSet } from '@gm/sdk/camera';
import Phaser from 'phaser';

import { game, getGameContext, type TemplateContext } from '../game.js';
import { hud } from '../hud.js';
import { GROUND_Y, PLAYER_HEIGHT, PLAYER_WIDTH } from '../state.js';

const LOCAL_COLOUR = 0x56c7ff;
const OTHER_COLOUR = 0xffb454;

export class Level extends Phaser.Scene {
  private readonly playerViews = new Map<number, Phaser.GameObjects.Rectangle>();
  private cameraRig: CameraRig | undefined;
  private cameraRigs: RigSet | undefined;
  private followedPlayer: number | undefined;
  private hudText: Phaser.GameObjects.Text | undefined;

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

    this.hudText = this.add
      .text(16, 16, '', { fontFamily: 'sans-serif', fontSize: '20px', color: '#ffffff' })
      .setScrollFactor(0);
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
    this.followedPlayer = undefined;
    this.followLocalPlayer(context);
  }

  update(_time: number, delta: number): void {
    const context = getGameContext();
    this.syncViews(context);
    this.followLocalPlayer(context);
    this.cameraRigs?.update(delta / 1000, [
      {
        playerIndex: context.localPlayerIndex,
        tick: context.state.tick,
        source: 'keyboard',
        actions: {},
      },
    ]);
  }

  /** The camera rig follows this client's avatar, whichever player index the room gave it. */
  private followLocalPlayer(context: TemplateContext): void {
    const local = context.localPlayerIndex;
    if (local === this.followedPlayer || !context.state.players.has(local) || !this.cameraRigs) return;
    this.followedPlayer = local;
    this.cameraRig = this.cameraRigs.attach(local, {
      position: () => {
        const player = getGameContext().state.players.get(local);
        return player ? [player.p[0], player.p[1], 0] : [0, 0, 0];
      },
    });
  }

  private syncViews(context: TemplateContext): void {
    for (const [playerIndex, player] of context.state.players) {
      let view = this.playerViews.get(playerIndex);
      if (!view) {
        view = this.add.rectangle(player.p[0], player.p[1], PLAYER_WIDTH, PLAYER_HEIGHT);
        view.setOrigin(0.5, 0);
        this.playerViews.set(playerIndex, view);
      }
      view.setFillStyle(playerIndex === context.localPlayerIndex ? LOCAL_COLOUR : OTHER_COLOUR);
      view.setPosition(player.p[0], player.p[1]);
    }

    for (const [playerIndex, view] of this.playerViews) {
      if (context.state.players.has(playerIndex)) continue;
      view.destroy();
      this.playerViews.delete(playerIndex);
    }

    const model = hud(context.state.players, context.localPlayerIndex);
    this.hudText?.setText(`P${model.player}`);
  }
}
