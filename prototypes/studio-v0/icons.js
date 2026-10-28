// Sticker-style icons for the New Game steps: chunky ink outline, gruvbox fills, 64x64.
const K = '#3c3836', R = '#fb4934', G = '#b8bb26', Y = '#fabd2f', B = '#83a598', P = '#d3869b', A = '#8ec07c', O = '#fe8019', W = '#fbf1c7', D = '#a89984', N = '#665c54';
const f = (fill, d, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const c = (fill, cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
const svg = body => `<svg viewBox="0 0 64 64" stroke="${K}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  // genre
  rpg: svg(f(D, 'M44 8 L56 8 L56 20 L28 46 L18 36 Z') + f(Y, 'M14 32 L32 50 L28 54 L10 36 Z') + f(O, 'M18 46 L10 54 a3 3 0 0 0 4 4 L22 50 Z')),
  platformer: svg(f(G, 'M4 50 h18 v8 h-18 z') + f(G, 'M40 36 h20 v8 h-20 z') + `<path d="M14 46 Q24 8 48 30" fill="none" stroke-dasharray="4 6"/>` + c(Y, 50, 26, 6)),
  adventure: svg(f(D, 'M4 56 L26 14 L36 30 L42 22 L60 56 Z') + f(W, 'M26 14 L33 27 L28 25 L22 29 Z') + `<path d="M30 56 Q40 44 34 36" fill="none" stroke-dasharray="3 5"/>`),
  craft: svg(f(O, 'M10 30 L32 22 L54 30 L54 52 L32 60 L10 52 Z') + f(Y, 'M10 30 L32 38 L54 30 L32 22 Z') + `<path d="M32 38 V60" fill="none"/>` + f(D, 'M30 4 l6 0 l0 14 l-6 0 z') + f(N, 'M24 2 h18 v6 h-18 z')),
  puzzle: svg(f(B, 'M8 26 h16 v16 h-16 z') + f(B, 'M24 26 h16 v16 h-16 z') + f(P, 'M24 10 h16 v16 h-16 z') + f(P, 'M40 10 h16 v16 h-16 z') + f(Y, 'M24 42 h16 v16 h-16 z')),
  battle: svg(f(R, 'M6 46 L26 38 L20 56 L18 44 Z') + f(B, 'M58 14 L38 22 L44 6 L46 18 Z') + `<path d="M24 40 L40 24" fill="none" stroke-dasharray="3 5"/>` + c(Y, 32, 32, 3)),
  strategy: svg(f(A, 'M8 40 h48 l-4 12 h-40 z') + f(G, 'M18 28 h24 v12 h-24 z') + f(N, 'M42 31 h16 v5 h-16 z') + c(D, 18, 52, 3) + c(D, 30, 52, 3) + c(D, 42, 52, 3)),
  racing: svg(`<path d="M12 58 V8" fill="none"/>` + f(W, 'M12 8 Q34 2 54 10 L54 34 Q34 26 12 32 Z') + f(K, 'M12 8 h10 v8 h-10z M32 6 h11 v8 h-11z M22 16 h10 v8 h-10z M43 18 h11 v8 h-11z M12 24 h10 v8 h-10z M32 22 h11 v8 h-11z', 'stroke-width="0"')),
  sports: svg(c(W, 32, 32, 24) + f(K, 'M32 22 l9 6 -3 11 h-12 l-3 -11 z', 'stroke-width="1"') + `<path d="M32 8 V22 M41 28 L54 24 M38 39 L46 52 M26 39 L18 52 M23 28 L10 24" fill="none" stroke-width="2.5"/>`),
  rhythm: svg(f(P, 'M22 46 a8 7 0 1 0 0.1 0 Z') + f(P, 'M48 40 a8 7 0 1 0 0.1 0 Z') + f(P, 'M28 46 V12 L54 6 V40 L50 40 V14 L32 18 V46 Z')),
  sim: svg(f(Y, 'M10 30 L32 10 L54 30 Z') + f(W, 'M16 30 h32 v26 h-32 z') + f(O, 'M28 40 h10 v16 h-10 z') + f(B, 'M19 35 h6 v6 h-6 z')),
  card: svg(f(W, 'M14 10 h26 a4 4 0 0 1 4 4 v36 a4 4 0 0 1 -4 4 h-26 a4 4 0 0 1 -4 -4 v-36 a4 4 0 0 1 4 -4 z', 'transform="rotate(-10 27 32)"') + f(W, 'M28 12 h22 a4 4 0 0 1 4 4 v36 a4 4 0 0 1 -4 4 h-22 a4 4 0 0 1 -4 -4 v-36 a4 4 0 0 1 4 -4 z', 'transform="rotate(8 39 34)"') + f(R, 'M40 26 c-4 -6 -12 -2 -8 5 l8 9 l8 -9 c4 -7 -4 -11 -8 -5z', 'stroke-width="2.5"')),
  // vibe
  retro: svg(f(D, 'M6 12 h52 v36 h-52 z') + f(B, 'M12 18 h32 v24 h-32 z') + c(Y, 51, 22, 3) + c(R, 51, 34, 3) + `<path d="M18 48 L14 58 M46 48 L50 58" fill="none"/>`),
  future: svg(f(W, 'M32 4 C44 14 46 30 42 44 H22 C18 30 20 14 32 4 Z') + c(B, 32, 22, 5) + f(R, 'M22 36 L12 48 L22 46 Z') + f(R, 'M42 36 L52 48 L42 46 Z') + f(O, 'M26 46 h12 l-6 14 z')),
  cool: svg(f(K, 'M6 26 h22 l-2 10 a9 9 0 0 1 -18 0 z') + f(K, 'M36 26 h22 l-2 10 a9 9 0 0 1 -18 0 z') + `<path d="M28 28 h8 M6 26 L2 18 M58 26 L62 18" fill="none"/>` + f(W, 'M12 30 l6 0 l-2 4 z', 'stroke-width="0" opacity=".7"')),
  cute: svg(f(W, 'M14 46 a10 10 0 0 1 0 -20 a14 14 0 0 1 26 -8 a12 12 0 0 1 12 28 z') + c(K, 26, 34, 2.5) + c(K, 40, 34, 2.5) + f(P, 'M20 40 a3 2 0 1 0 .1 0z M46 40 a3 2 0 1 0 .1 0z', 'stroke-width="0"') + `<path d="M30 40 q3 3 6 0" fill="none" stroke-width="2.5"/>`),
  old: svg(f(O, 'M10 30 Q12 22 24 24 L40 24 Q46 14 54 14 L58 22 L50 26 L48 40 L44 40 L42 32 L22 34 L20 46 L16 46 L16 34 Q10 36 10 30 Z') + `<path d="M24 34 L22 52 M42 32 L44 52" fill="none"/>` + f(N, 'M52 12 q4 -6 8 -2 l-4 6 z')),
  creepy: svg(c(W, 22, 30, 9) + c(W, 44, 30, 9) + c(K, 24, 32, 4) + c(K, 42, 32, 4) + `<path d="M12 16 L26 22 M52 16 L38 22 M28 48 q4 -4 8 0" fill="none"/>`),
  cozy: svg(f(W, 'M14 22 h30 v24 a10 10 0 0 1 -10 10 h-10 a10 10 0 0 1 -10 -10 z') + f(O, 'M17 26 h24 v6 h-24 z', 'stroke-width="0"') + `<path d="M44 28 h6 a6 6 0 0 1 0 12 h-6 M22 16 q-3 -5 0 -10 M30 16 q-3 -5 0 -10 M38 16 q-3 -5 0 -10" fill="none"/>`),
  epic: svg(f(Y, 'M32 2 L38 20 L58 14 L44 30 L62 42 L40 42 L42 62 L30 46 L16 60 L20 40 L2 36 L18 26 L8 10 L26 18 Z') + f(O, 'M32 18 L35 28 L45 28 L37 34 L40 44 L32 38 L24 44 L27 34 L19 28 L29 28 Z', 'stroke-width="2"')),
  surreal: svg(f(B, 'M10 12 h44 v22 q-6 0 -8 8 q-2 10 -8 10 q-4 0 -4 -8 q0 -6 -6 -6 h-18 z') + c(W, 32, 22, 7) + `<path d="M32 22 V18 M32 22 h4" fill="none" stroke-width="2.5"/>` + f(B, 'M38 52 q0 8 3 8 q3 0 3 -8', 'stroke-width="2.5"')),
  funny: svg(c(Y, 32, 32, 24) + `<path d="M20 26 q4 -5 8 0 M36 26 q4 -5 8 0" fill="none"/>` + f(R, 'M18 36 h28 q-2 16 -14 16 q-12 0 -14 -16 z')),
  calm: svg(f(A, 'M10 50 Q10 14 54 10 Q52 50 10 50 Z') + `<path d="M10 50 L40 22 M24 36 h10 M30 30 v-8" fill="none"/>`),
  // art (only styles our packs cover)
  bit1: svg(f(W, 'M8 8 h48 v48 h-48 z') + f(K, 'M20 16 h8 v8 h-8z M36 16 h8 v8 h-8z M16 32 h8 v8 h-8z M40 32 h8 v8 h-8z M24 40 h16 v8 h-16z', 'stroke-width="0"')),
  bit8: svg(f(W, 'M8 8 h48 v48 h-48 z') + f(R, 'M20 16 h24 v8 h-24z', 'stroke-width="0"') + f(Y, 'M16 24 h32 v16 h-32z', 'stroke-width="0"') + f(K, 'M24 28 h4 v4 h-4z M36 28 h4 v4 h-4z', 'stroke-width="0"') + f(B, 'M20 40 h24 v8 h-24z', 'stroke-width="0"') + `<path d="M8 24 h48 M8 40 h48 M24 8 v48 M40 8 v48" fill="none" stroke-width="1.2" opacity=".35"/>`),
  bit16: svg(f(W, 'M8 8 h48 v48 h-48 z') + `<path d="M16 8 v48 M24 8 v48 M32 8 v48 M40 8 v48 M48 8 v48 M8 16 h48 M8 24 h48 M8 32 h48 M8 40 h48 M8 48 h48" fill="none" stroke-width="1" opacity=".3"/>` + f(G, 'M8 40 h48 v16 h-48z', 'stroke-width="0"') + f(O, 'M24 24 h16 v16 h-16z', 'stroke-width="0"') + f(R, 'M24 16 h16 v8 h-16z', 'stroke-width="0"') + `<rect x="8" y="8" width="48" height="48" fill="none"/>`),
  cartoon: svg(c(G, 32, 34, 22) + c(W, 24, 30, 7) + c(W, 40, 30, 7) + c(K, 26, 31, 3) + c(K, 42, 31, 3) + `<path d="M24 44 q8 6 16 0" fill="none"/>` + f(G, 'M20 14 L14 4 L26 10 Z M44 14 L50 4 L38 10 Z')),
  sketch: svg(f(W, 'M8 10 L56 8 L54 56 L10 54 Z') + `<path d="M16 44 L26 26 L32 36 L38 22 L48 44 M14 46 L50 45 M18 18 q4 -4 8 0" fill="none" stroke-width="2.5"/>`),
  iso: svg(f(Y, 'M32 6 L56 20 L32 34 L8 20 Z') + f(O, 'M8 20 L32 34 L32 58 L8 44 Z') + f(R, 'M56 20 L32 34 L32 58 L56 44 Z')),
  toy3d: svg(f(A, 'M10 46 L32 34 L54 46 L32 58 Z') + f(O, 'M24 22 h16 v18 h-16 z') + f(R, 'M20 24 L32 10 L44 24 Z') + c(Y, 50, 14, 5)),
  voxel: svg(f(B, 'M18 14 L32 6 L46 14 L32 22 Z') + f('#458588', 'M18 14 L32 22 L32 38 L18 30 Z') + f('#076678', 'M46 14 L32 22 L32 38 L46 30 Z') + f(G, 'M4 38 L18 30 L32 38 L18 46 Z') + f('#98971a', 'M4 38 L18 46 L18 58 L4 50 Z') + f('#79740e', 'M32 38 L18 46 L18 58 L32 50 Z')),
  retro3d: svg(f(D, 'M8 50 L32 12 L56 50 Z') + f(N, 'M32 12 L56 50 L32 44 Z') + `<path d="M14 40 l6 -2 M40 30 l6 4 M24 30 l4 2" fill="none" stroke-width="2"/>` + f(Y, 'M4 56 h56 v4 h-56z', 'stroke-width="0" opacity=".6"')),
  lowpoly: svg(f(A, 'M4 52 L20 26 L32 40 L44 18 L60 52 Z') + f(G, 'M20 26 L32 40 L22 52 Z') + f('#689d6a', 'M44 18 L60 52 L40 52 Z') + f(W, 'M44 18 L50 30 L42 28 Z')),
  // world
  dungeon: svg(f(D, 'M10 58 V24 a22 22 0 0 1 44 0 V58 Z') + f(O, 'M18 58 V28 a14 14 0 0 1 28 0 V58 Z') + `<path d="M32 16 V58 M18 38 h28" fill="none" stroke-width="2.5"/>` + c(Y, 40, 44, 2.5)),
  forest: svg(f(G, 'M20 6 L34 30 H26 L38 50 H2 L14 30 H6 Z') + f(A, 'M44 14 L58 38 H50 L62 56 H26 L38 38 H30 Z') + `<path d="M20 50 V58 M44 56 V62" fill="none"/>`),
  spaceW: svg(c(P, 30, 34, 16) + `<ellipse cx="30" cy="34" rx="28" ry="7" fill="none" transform="rotate(-18 30 34)"/>` + c(Y, 52, 10, 4) + c(W, 10, 12, 2)),
  city: svg(f(B, 'M6 58 V26 h14 V58') + f(D, 'M20 58 V10 h16 V58') + f(O, 'M36 58 V30 h20 V58') + `<path d="M24 18 h8 M24 28 h8 M24 38 h8 M40 38 h12 M40 46 h12" fill="none" stroke-width="2.5"/>` + `<path d="M2 58 h60" fill="none"/>`),
  ocean: svg(f(B, 'M2 30 q8 -8 15 0 t15 0 t15 0 t15 0 V60 H2 Z') + `<path d="M2 44 q8 -8 15 0 t15 0 t15 0 t15 0" fill="none"/>` + f(W, 'M38 8 L38 26 L52 26 Z')),
  desert: svg(f(Y, 'M2 56 q20 -14 60 0 z') + f(G, 'M28 50 V14 a5 5 0 0 1 10 0 V50 Z') + f(G, 'M28 32 h-10 v-10 a4 4 0 0 1 8 0 v4 h2 Z') + f(G, 'M38 26 h8 v-8 a4 4 0 0 1 8 0 v14 h-16 Z') + c(O, 52, 10, 5)),
  sky: svg(f(W, 'M10 22 a8 8 0 0 1 10 -10 a12 12 0 0 1 22 2 a8 8 0 0 1 6 10 z') + f(G, 'M12 36 h40 l-8 10 h-24 z') + f(D, 'M20 46 h24 l-12 14 z') + f(O, 'M28 26 h8 v10 h-8z')),
  snow: svg(`<path d="M32 4 V60 M8 18 L56 46 M8 46 L56 18 M26 8 L32 14 L38 8 M26 56 L32 50 L38 56" fill="none" stroke="${B}" stroke-width="5"/>` + `<path d="M32 4 V60 M8 18 L56 46 M8 46 L56 18" fill="none" stroke-width="1.5"/>`),
  castle: svg(f(D, 'M8 58 V20 h8 v6 h6 v-6 h8 v6 h4 v-6 h8 v6 h6 v-6 h8 V58 Z') + f(O, 'M26 58 V44 a6 6 0 0 1 12 0 V58 Z') + `<path d="M32 4 V18" fill="none"/>` + f(R, 'M32 4 L44 8 L32 12 Z')),
  farm: svg(f(R, 'M8 58 V28 L32 10 L56 28 V58 Z') + f(W, 'M24 58 V38 h16 V58 Z') + `<path d="M24 38 L40 58 M40 38 L24 58" fill="none" stroke-width="2.5"/>` + f(Y, 'M26 20 h12 v8 h-12z')),
  haunted: svg(f(W, 'M14 58 V28 a18 18 0 0 1 36 0 V58 l-6 -6 -6 6 -6 -6 -6 6 -6 -6 z') + c(K, 26, 30, 3) + c(K, 40, 30, 3) + `<ellipse cx="33" cy="42" rx="4" ry="5" fill="${K}"/>`),
  // players
  solo: svg(c(Y, 32, 18, 10) + f(O, 'M14 58 a18 18 0 0 1 36 0 z')),
  coop: svg(c(Y, 22, 20, 9) + f(O, 'M6 58 a16 16 0 0 1 32 0 z') + c(B, 44, 20, 9) + f(A, 'M28 58 a16 16 0 0 1 32 0 z')),
  versus: svg(f(D, 'M8 8 L14 8 L46 40 L40 46 Z') + f(D, 'M56 8 L50 8 L18 40 L24 46 Z') + f(R, 'M36 44 l10 -10 l6 6 l-10 10 z') + f(B, 'M28 44 l-10 -10 l-6 6 l10 10 z')),
  online: svg(c(B, 32, 32, 24) + `<ellipse cx="32" cy="32" rx="10" ry="24" fill="none"/><path d="M8 32 h48 M12 20 h40 M12 44 h40" fill="none" stroke-width="2.5"/>`),
  party: svg(c(Y, 14, 26, 7) + c(B, 32, 20, 7) + c(P, 50, 26, 7) + f(O, 'M2 58 a12 12 0 0 1 24 0 z') + f(A, 'M20 52 a12 12 0 0 1 24 0 z') + f(R, 'M38 58 a12 12 0 0 1 24 0 z')),
  bots: svg(f(D, 'M14 20 h36 v28 h-36 z') + c(Y, 26, 32, 5) + c(Y, 40, 32, 5) + `<path d="M32 20 V10 M26 42 h12" fill="none"/>` + c(R, 32, 8, 3)),
  pass: svg(f(N, 'M18 6 h28 a4 4 0 0 1 4 4 v44 a4 4 0 0 1 -4 4 h-28 a4 4 0 0 1 -4 -4 v-44 a4 4 0 0 1 4 -4 z') + f(B, 'M19 12 h26 v36 h-26 z') + `<path d="M24 30 h16 M34 24 l6 6 -6 6" fill="none"/>`),
  // Other: the pencil / speaker pair
  other: svg(f(W, 'M14 50 L46 18 L54 26 L22 58 L12 60 Z') + f(Y, 'M46 18 L52 12 L60 20 L54 26 Z') + `<path d="M14 50 L22 58" fill="none"/>` + c(D, 14, 14, 3) + c(D, 24, 14, 3) + c(D, 34, 14, 3)),
  pencil: svg(f(Y, 'M10 46 L42 14 L50 22 L18 54 L8 56 Z') + f(R, 'M42 14 L48 8 L56 16 L50 22 Z') + f(W, 'M10 46 L18 54 L8 56 Z')),
  speak: svg(c(Y, 22, 22, 10) + f(O, 'M4 58 a18 18 0 0 1 36 0 z') + `<path d="M42 16 q6 6 0 12 M48 10 q12 12 0 24 M54 4 q18 18 0 36" fill="none"/>`),
  mic: svg(f(W, 'M24 8 a8 8 0 0 1 16 0 v22 a8 8 0 0 1 -16 0 z') + `<path d="M16 28 a16 16 0 0 0 32 0 M32 44 V56 M22 56 h20" fill="none"/>`),
};
