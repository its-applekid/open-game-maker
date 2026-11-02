import Phaser from 'phaser';

import cues from '../trailer-cues.json' with { type: 'json' };
import { getGameContext } from '../game.js';
import { privateAudio, privateImages, privateSheets } from '../private-assets.js';
import { isSceneId, sampleScene, type ActorSample, type SceneId, type SceneSample } from '../sampler.js';

const BASE = 'assets-local/';
const privateImagesByKey = new Set<string>(privateImages);
const privateSheetsByKey = new Map(privateSheets.map((sheet) => [sheet.key, sheet]));
declare const __GM_PRIVATE_ASSETS__: boolean;
const PALETTES: Record<SceneId, { sky: number; ground: number; edge: number; accent: number }> = {
  village: { sky: 0x21384a, ground: 0x5c8448, edge: 0x324d36, accent: 0xf3d37a },
  fight: { sky: 0x281f35, ground: 0x5a6046, edge: 0x303528, accent: 0xf26f5f },
  loot: { sky: 0x3b2542, ground: 0xb68745, edge: 0x695031, accent: 0xffcf52 },
  rural: { sky: 0x172b31, ground: 0x53644c, edge: 0x2d392e, accent: 0xd8de9a },
  interior: { sky: 0x171520, ground: 0x514756, edge: 0x29242e, accent: 0xee806c },
  creatures: { sky: 0x183b43, ground: 0x63894f, edge: 0x31503b, accent: 0xeec96b },
};

type ActorView = Phaser.GameObjects.Sprite | Phaser.GameObjects.Container | Phaser.GameObjects.Arc;

export class Level extends Phaser.Scene {
  private readonly privateMode = __GM_PRIVATE_ASSETS__ || new URLSearchParams(location.search).get('private') === '1';
  private readonly pinnedScene: SceneId | undefined = (() => {
    const value = new URLSearchParams(location.search).get('scene');
    return isSceneId(value) ? value : undefined;
  })();
  private root?: Phaser.GameObjects.Container;
  private currentScene?: SceneId;
  private actorViews = new Map<string, ActorView>();
  private lastCueCycle = -1;

  constructor() {
    super('level');
  }

  preload(): void {
    if (!this.privateMode) return;
    for (const asset of privateSheets) {
      this.load.spritesheet(asset.key, `${BASE}${asset.file}`, {
        frameWidth: asset.frameWidth,
        frameHeight: asset.frameHeight,
      });
    }
    for (const key of privateImages) this.load.image(key, `${BASE}${key}.png`);
    for (const key of privateAudio) this.load.audio(key, `${BASE}audio/${key}.ogg`);
  }

  create(): void {
    if (this.privateMode) {
      for (const sheet of privateSheets) {
        const { width } = this.textures.get(sheet.key).getSourceImage();
        if (width !== sheet.frameWidth * sheet.columns)
          throw new Error(`${sheet.key}: ${width}px wide, expected ${sheet.columns} x ${sheet.frameWidth}px frames`);
      }
    }
    this.cameras.main.setBackgroundColor(0x121820);
    this.renderSample(sampleScene(0, this.pinnedScene));
  }

  update(): void {
    const elapsedSeconds = getGameContext().state.elapsedMs / 1_000;
    const sample = sampleScene(elapsedSeconds, this.pinnedScene);
    this.renderSample(sample);
    if (this.privateMode && !this.pinnedScene) this.playCues(elapsedSeconds);
  }

  private renderSample(sample: SceneSample): void {
    if (sample.id !== this.currentScene) this.buildStage(sample.id);
    const ids = new Set(sample.actors.map(({ id }) => id));
    for (const [id, view] of this.actorViews) {
      if (ids.has(id)) continue;
      view.destroy();
      this.actorViews.delete(id);
    }
    for (const actor of sample.actors) this.syncActor(actor, sample.localSeconds);
  }

  private buildStage(id: SceneId): void {
    this.root?.destroy(true);
    this.root = this.add.container(0, 0);
    this.actorViews.clear();
    this.currentScene = id;

    const palette = PALETTES[id];
    const graphics = this.add.graphics();
    graphics.fillStyle(palette.sky, 1).fillRect(0, 0, 480, 300);
    graphics.fillStyle(0xffffff, 0.035).fillCircle(388, 52, 72);
    for (let row = 0; row < 5; row += 1) {
      for (let column = 0; column < 7; column += 1) {
        const x = 48 + column * 64 + (row % 2) * 32;
        const y = 137 + row * 31;
        const points = [
          new Phaser.Math.Vector2(x, y - 24),
          new Phaser.Math.Vector2(x + 48, y),
          new Phaser.Math.Vector2(x, y + 24),
          new Phaser.Math.Vector2(x - 48, y),
        ];
        graphics.fillStyle((row + column) % 2 === 0 ? palette.ground : palette.edge, 1).fillPoints(points, true);
        graphics.lineStyle(1, 0xffffff, 0.065).strokePoints(points, true);
      }
    }
    this.root.add(graphics);
    this.addStageProps(id);
  }

  private addStageProps(id: SceneId): void {
    if (!this.root) return;
    if (!this.privateMode) {
      const silhouettes = this.add.graphics();
      silhouettes.fillStyle(PALETTES[id].edge, 0.95).fillRoundedRect(48, 92, 74, 92, 8);
      silhouettes.fillStyle(PALETTES[id].accent, 0.2).fillCircle(385, 122, 40);
      this.root.add(silhouettes);
      return;
    }

    const props: Array<[string, number, number, number]> =
      id === 'village' || id === 'fight'
        ? [
            ['fantasy-wall', 92, 134, 0.58],
            ['fantasy-flora', 392, 126, 0.62],
          ]
        : id === 'loot'
          ? [
              ['desert-wall', 105, 134, 0.58],
              ['desert-wall', 398, 158, 0.5],
            ]
          : id === 'rural'
            ? [
                ['rural-car', 364, 150, 0.55],
                ['rural-fence', 95, 151, 0.52],
              ]
            : id === 'interior'
              ? [
                  ['interior-bed', 92, 144, 0.58],
                  ['interior-couch', 373, 151, 0.55],
                ]
              : [
                  ['fantasy-flora', 84, 136, 0.57],
                  ['fantasy-flora', 408, 149, 0.5],
                ];

    for (const [key, x, y, scale] of props) {
      const image = this.add
        .image(x, y, key)
        .setScale(scale)
        .setDepth(y - 50);
      this.root.add(image);
    }
  }

  private syncActor(actor: ActorSample, seconds: number): void {
    let view = this.actorViews.get(actor.id);
    if (!view || view.getData('asset') !== actor.asset) {
      view?.destroy();
      view = this.createActor(actor);
      view.setData('asset', actor.asset);
      this.actorViews.set(actor.id, view);
      this.root?.add(view);
    }
    view
      .setPosition(actor.x, actor.y)
      .setScale(actor.scale)
      .setAlpha(actor.alpha ?? 1)
      .setDepth(actor.y);
    if (view instanceof Phaser.GameObjects.Sprite) {
      view.setFlipX(actor.flipX ?? false);
      const sheet = privateSheetsByKey.get(actor.asset);
      if (sheet) view.setFrame(sheet.directionRow * sheet.columns + (Math.floor(seconds * 12) % sheet.columns));
    }
  }

  private createActor(actor: ActorSample): ActorView {
    if (actor.asset === 'spark') {
      return this.add.circle(actor.x, actor.y, 7, PALETTES[this.currentScene!].accent, 0.9);
    }
    if (this.privateMode) {
      if (privateSheetsByKey.has(actor.asset) || privateImagesByKey.has(actor.asset))
        return this.add.sprite(actor.x, actor.y, actor.asset);
    }

    const color = PALETTES[this.currentScene!].accent;
    const shadow = this.add.ellipse(0, 16, 36, 14, 0x0a1016, 0.45);
    const body = this.add.rectangle(0, -4, 24, 38, color, 1).setStrokeStyle(3, 0x121820, 0.8);
    const head = this.add.circle(0, -29, 11, color, 1).setStrokeStyle(3, 0x121820, 0.8);
    return this.add.container(actor.x, actor.y, [shadow, body, head]);
  }

  private playCues(elapsedSeconds: number): void {
    const cycle = Math.floor(elapsedSeconds * 10);
    if (cycle === this.lastCueCycle) return;
    this.lastCueCycle = cycle;
    for (const cue of cues.cues) {
      if (Math.floor(cue.at * 10) !== cycle) continue;
      this.sound.play(cue.sound, { volume: cue.volume });
    }
  }
}
