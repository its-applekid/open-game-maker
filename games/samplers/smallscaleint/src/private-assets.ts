export interface SheetAsset {
  key: string;
  file: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  directionRow: number;
}

export const privateSheets: SheetAsset[] = [
  { key: 'knight-walk', file: 'knight-walk.png', frameWidth: 128, frameHeight: 128, columns: 15, directionRow: 1 },
  { key: 'knight-idle', file: 'knight-idle.png', frameWidth: 128, frameHeight: 128, columns: 15, directionRow: 1 },
  { key: 'knight-melee', file: 'knight-melee.png', frameWidth: 128, frameHeight: 128, columns: 15, directionRow: 1 },
  { key: 'orc-attack', file: 'orc-attack.png', frameWidth: 128, frameHeight: 128, columns: 15, directionRow: 5 },
  { key: 'orc-damage', file: 'orc-damage.png', frameWidth: 128, frameHeight: 128, columns: 15, directionRow: 5 },
  { key: 'survivor-run', file: 'survivor-run.png', frameWidth: 128, frameHeight: 128, columns: 15, directionRow: 1 },
  { key: 'survivor-idle', file: 'survivor-idle.png', frameWidth: 128, frameHeight: 128, columns: 15, directionRow: 1 },
  { key: 'zombie-run', file: 'zombie-run.png', frameWidth: 128, frameHeight: 128, columns: 15, directionRow: 1 },
  { key: 'zombie-attack', file: 'zombie-attack.png', frameWidth: 128, frameHeight: 128, columns: 15, directionRow: 1 },
  { key: 'alpacha-idle', file: 'alpacha-idle.png', frameWidth: 64, frameHeight: 64, columns: 15, directionRow: 1 },
  { key: 'bison-idle', file: 'bison-idle.png', frameWidth: 96, frameHeight: 96, columns: 15, directionRow: 1 },
  { key: 'bison-run', file: 'bison-run.png', frameWidth: 96, frameHeight: 96, columns: 15, directionRow: 1 },
  { key: 'wolf-run', file: 'wolf-run.png', frameWidth: 64, frameHeight: 64, columns: 15, directionRow: 1 },
];

export const privateImages = [
  'fantasy-flora',
  'fantasy-wall',
  'desert-chest',
  'desert-chest-open',
  'desert-wall',
  'rural-car',
  'rural-fence',
  'interior-bed',
  'interior-couch',
] as const;

export const privateAudio = ['move-a', 'hurt-a', 'coin-a'] as const;
