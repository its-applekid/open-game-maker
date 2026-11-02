export type Mirror = {
  id: string;
  kind: 'git' | 'npm';
  source: string;
  pin: string;
  title: string;
  license:
    | { mode: 'single'; spdx: string; ref: string; attribution: string | null }
    | { mode: 'per-item'; mapper: 'lpc-credits-csv' | 'game-icons-authors' | 'fontsource-metadata'; ref: string };
  subpaths?: string[];
};

export const MIRRORS: Mirror[] = [
  {
    id: 'kaykit',
    kind: 'git',
    source: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0.git',
    // reviewed 2026-11-01
    pin: '672074b73ba276876a19e8816ecdc5241817ab47',
    title: 'KayKit Character Pack: Adventures',
    license: { mode: 'single', spdx: 'CC0-1.0', ref: 'LICENSE.txt', attribution: 'KayKit' },
  },
  {
    id: 'lpc',
    kind: 'git',
    source: 'https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator.git',
    // reviewed 2026-11-01
    pin: '86160e7507d6841259cff624a51a63c1d4847ee3',
    title: 'Universal LPC Spritesheet Character Generator',
    license: { mode: 'per-item', mapper: 'lpc-credits-csv', ref: 'CREDITS.csv' },
    subpaths: ['spritesheets'],
  },
  {
    id: 'game-icons',
    kind: 'git',
    source: 'https://github.com/game-icons/icons.git',
    // reviewed 2026-11-01
    pin: '82d948812bfe3f269ef8f731dcdb07b08160edc4',
    title: 'game-icons.net',
    license: { mode: 'per-item', mapper: 'game-icons-authors', ref: 'README.md#license' },
  },
  {
    id: 'fontsource',
    kind: 'npm',
    source: '@fontsource/<font>',
    // reviewed 2026-11-01
    pin: '5.3.0',
    title: 'Fontsource <font>',
    license: { mode: 'per-item', mapper: 'fontsource-metadata', ref: 'package.json or metadata.json' },
  },
];

export function findMirror(id: string): Mirror | undefined {
  const direct = MIRRORS.find((mirror) => mirror.id === id);
  if (direct && direct.id !== 'fontsource') return direct;
  const match = /^fontsource:([a-z0-9][a-z0-9-]*)$/.exec(id);
  const template = MIRRORS.find((mirror) => mirror.id === 'fontsource');
  if (!match || !template) return undefined;
  const font = match[1]!;
  return {
    ...template,
    id: `fontsource-${font}`,
    source: `@fontsource/${font}`,
    title: `Fontsource ${font}`,
  };
}
