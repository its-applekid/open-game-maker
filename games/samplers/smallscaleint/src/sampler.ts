export const SCENE_SECONDS = 4;

export const sceneIds = ['village', 'fight', 'loot', 'rural', 'interior', 'creatures'] as const;
export type SceneId = (typeof sceneIds)[number];

export interface ActorSample {
  id: string;
  asset: string;
  x: number;
  y: number;
  scale: number;
  flipX?: boolean;
  alpha?: number;
}

export interface SceneSample {
  id: SceneId;
  localSeconds: number;
  actors: ActorSample[];
  eventComplete: boolean;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const ease = (value: number): number => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export function sceneAt(elapsedSeconds: number, pinned?: SceneId): { id: SceneId; localSeconds: number } {
  const safe = Math.max(0, elapsedSeconds);
  if (pinned) return { id: pinned, localSeconds: safe % SCENE_SECONDS };
  const index = Math.floor(safe / SCENE_SECONDS) % sceneIds.length;
  return { id: sceneIds[index]!, localSeconds: safe % SCENE_SECONDS };
}

export function sampleScene(elapsedSeconds: number, pinned?: SceneId): SceneSample {
  const { id, localSeconds: t } = sceneAt(elapsedSeconds, pinned);

  switch (id) {
    case 'village': {
      const arrival = ease((t - 0.4) / 2.7);
      return {
        id,
        localSeconds: t,
        actors: [
          {
            id: 'knight',
            asset: arrival < 0.98 ? 'knight-walk' : 'knight-idle',
            x: 18 + arrival * 205,
            y: 214,
            scale: 0.82,
          },
          { id: 'alpacha', asset: 'alpacha-idle', x: 348, y: 203, scale: 1.18, flipX: true },
        ],
        eventComplete: arrival >= 0.98,
      };
    }
    case 'fight': {
      const close = ease(t / 1.3);
      const strike = ease((t - 1.25) / 0.55);
      const recoil = ease((t - 1.7) / 0.8);
      return {
        id,
        localSeconds: t,
        actors: [
          {
            id: 'knight',
            asset: t < 1.2 ? 'knight-walk' : 'knight-melee',
            x: 126 + close * 48 + strike * 18,
            y: 213,
            scale: 0.84,
          },
          {
            id: 'orc',
            asset: recoil > 0 ? 'orc-damage' : 'orc-attack',
            x: 344 - close * 52 + recoil * 54,
            y: 213,
            scale: 0.84,
            flipX: true,
          },
        ],
        eventComplete: recoil >= 0.98,
      };
    }
    case 'loot': {
      const approach = ease(t / 1.6);
      const open = t >= 1.75;
      return {
        id,
        localSeconds: t,
        actors: [
          {
            id: 'knight',
            asset: approach < 0.98 ? 'knight-walk' : 'knight-idle',
            x: 78 + approach * 120,
            y: 220,
            scale: 0.78,
          },
          {
            id: 'chest',
            asset: open ? 'desert-chest-open' : 'desert-chest',
            x: 303,
            y: 206,
            scale: open ? 0.56 : 0.54,
          },
          ...(open
            ? [
                { id: 'spark-a', asset: 'spark', x: 291, y: 145 - Math.sin(t * 6) * 5, scale: 1 },
                { id: 'spark-b', asset: 'spark', x: 320, y: 157 - Math.cos(t * 5) * 7, scale: 0.65 },
              ]
            : []),
        ],
        eventComplete: open,
      };
    }
    case 'rural': {
      const run = ease(t / 3.3);
      return {
        id,
        localSeconds: t,
        actors: [
          { id: 'survivor', asset: 'survivor-run', x: 104 + run * 260, y: 213 - Math.sin(t * 8) * 2, scale: 0.78 },
          { id: 'zombie-a', asset: 'zombie-run', x: 18 + run * 224, y: 213, scale: 0.78 },
          { id: 'zombie-b', asset: 'zombie-run', x: -48 + run * 226, y: 238, scale: 0.75 },
        ],
        eventComplete: run >= 0.96,
      };
    }
    case 'interior': {
      const reveal = ease((t - 0.8) / 1.35);
      const survivorShift = ease((t - 1.7) / 0.8);
      return {
        id,
        localSeconds: t,
        actors: [
          {
            id: 'survivor',
            asset: survivorShift > 0 ? 'survivor-run' : 'survivor-idle',
            x: 205 + survivorShift * 42,
            y: 222,
            scale: 0.78,
          },
          {
            id: 'ambusher',
            asset: reveal > 0.72 ? 'zombie-attack' : 'zombie-run',
            x: 74 + reveal * 105,
            y: 190 + reveal * 24,
            scale: 0.8,
          },
        ],
        eventComplete: survivorShift >= 0.95,
      };
    }
    case 'creatures': {
      const charge = ease((t - 1.05) / 2.25);
      return {
        id,
        localSeconds: t,
        actors: [
          { id: 'alpacha', asset: 'alpacha-idle', x: 292, y: 203, scale: 1.2, flipX: true },
          { id: 'bison', asset: charge > 0 ? 'bison-run' : 'bison-idle', x: 54 + charge * 190, y: 226, scale: 1.15 },
          { id: 'wolf', asset: 'wolf-run', x: 8 + charge * 154, y: 247, scale: 1.08 },
        ],
        eventComplete: charge >= 0.96,
      };
    }
  }
}

export function isSceneId(value: string | null): value is SceneId {
  return value !== null && sceneIds.includes(value as SceneId);
}
