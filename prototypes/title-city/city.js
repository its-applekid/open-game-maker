// The title screen's world: a walled castle town on a coastal plain, ocean on one side, mountains on the other, a river
// winding out of a wide valley through the town to the sea. Inside the wall: a market square and districts of tower houses
// on cobbled streets; outside it, a slum of shacks and a patchwork of fields; behind, a large castle on its hill.
// Built from Kenney Castle Kit and Mini Dungeon pieces and variants cloned from them (tools/variants.mjs).
// Every moving thing runs on its own loop (houses rebuilt, boats, clouds, and a pastel day/night cycle), with periods that
// don't line up, so the view rarely repeats exactly.
// ?cam=a|b|c picks the framing; ?capture stops the clock and window.__frame(t) draws time t (for recording).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const Q = new URLSearchParams(location.search);
const CAPTURE = Q.has('capture'), CAM = Q.get('cam') || 'a';
const DAY = +(Q.get('day') || 120);   // seconds for one day/night cycle (short for the preview)
const TAU = Math.PI * 2;

// ---------------- helpers ----------------
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
let R = rng(11);
const rr = (a, b) => a + R() * (b - a), pk = a => a[Math.floor(R() * a.length)];
const clamp01 = x => Math.min(1, Math.max(0, x)), smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const ease = x => 1 - (1 - clamp01(x)) ** 3, easeIn = x => clamp01(x) ** 2.2;
const sstep = (a, b, x) => smooth((x - a) / (b - a));
const mod = (a, n) => ((a % n) + n) % n;
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z) => { let s = 0, a = .5, f = 1; for (let i = 0; i < 5; i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= .5; } return s; };
const ridge = (x, z) => { let s = 0, a = .55, f = 1; for (let i = 0; i < 6; i++) { s += a * (1 - Math.abs(vnoise(x * f, z * f) * 2 - 1)) ** 2; f *= 2.1; a *= .5; } return s; };
const C = c => new THREE.Color(c);

// ---------------- colour ----------------
// roofs take one of a few pastel tones per building; the kit's own stone, plaster and wood stay, flattened and softened
const ROOFS = { noble: ['#7d8fb8', '#a58bb0', '#6f7894'], artisan: ['#d98f73', '#c9806a', '#e0a07a', '#9bb08a'], harbor: ['#6f7894', '#7d8fb8', '#9bb08a'], castle: ['#7d8fb8'] };
const PASTEL = ['#fb4934', '#fabd2f', '#b8bb26', '#83a598', '#d3869b', '#8ec07c', '#fe8019'].map(c => C(c).lerp(C('#fbf1c7'), .35));
const BRIGHT = ['#fb4934', '#fabd2f', '#b8bb26', '#83a598', '#d3869b', '#8ec07c', '#fe8019'].map(C);
const TREES = ['#98a86a', '#8ab07f', '#a3b46a', '#7fa38a', '#b0b98a'].map(C), BLOSSOM = ['#eeb2c2', '#e8a0b4', '#e8916e', '#e8c66e'].map(C);
const FIELDS = ['#e6d39a', '#b9c98f', '#a9bf86', '#cdbbd9', '#d9c48c', '#c2cf96'].map(C);
const GROUND = { sand: '#ecd9b4', grass: '#b3bf95', grass2: '#a5b58f', forest: '#8aa08a', rock: '#b0a3a8', snow: '#f7f1ee', shallow: '#a3d4c6', deep: '#5d7fa8', cobble: '#d6c8b6', dirt: '#c9b294' };
const KEYS = [
  { p: 0, top: '#93b4e0', hor: '#f6e2cf', fog: '#efdfd2', sun: '#fff1dc', sunI: 1.15, hemi: '#fff4ea', hemiG: '#a59b8f', hemiI: .95, ocean: '#6f97c2', elev: .9, night: 0 },
  { p: .28, top: '#8b95cc', hor: '#f4cdb6', fog: '#eccbbc', sun: '#ffd8b0', sunI: 1, hemi: '#f6e1ee', hemiG: '#9a8a90', hemiI: .85, ocean: '#5f80b2', elev: .35, night: 0 },
  { p: .4, top: '#6c6fb0', hor: '#efb1a8', fog: '#d9adb2', sun: '#ffb59a', sunI: .7, hemi: '#e6c9e6', hemiG: '#7a6a86', hemiI: .75, ocean: '#55689e', elev: .08, night: .35 },
  { p: .5, top: '#2b3266', hor: '#6e5f98', fog: '#5a5288', sun: '#c9d2ff', sunI: .35, hemi: '#8d93cf', hemiG: '#3a3656', hemiI: .7, ocean: '#2c3a6e', elev: .6, night: 1 },
  { p: .7, top: '#2f3770', hor: '#7b6aa0', fog: '#655b90', sun: '#c9d2ff', sunI: .35, hemi: '#9097d2', hemiG: '#3a3656', hemiI: .7, ocean: '#304074', elev: .6, night: 1 },
  { p: .8, top: '#7d86c8', hor: '#f3c0c8', fog: '#e8c2c8', sun: '#ffd0c0', sunI: .75, hemi: '#f3d6e6', hemiG: '#8a7f90', hemiI: .8, ocean: '#5f78ae', elev: .1, night: .3 },
  { p: .9, top: '#8eaedc', hor: '#f7dccb', fog: '#eed9cc', sun: '#ffe8d0', sunI: 1.05, hemi: '#fdf0ea', hemiG: '#a39a8f', hemiI: .9, ocean: '#6a90c0', elev: .5, night: 0 },
  { p: 1, top: '#93b4e0', hor: '#f6e2cf', fog: '#efdfd2', sun: '#fff1dc', sunI: 1.15, hemi: '#fff4ea', hemiG: '#a59b8f', hemiI: .95, ocean: '#6f97c2', elev: .9, night: 0 },
].map(k => Object.fromEntries(Object.entries(k).map(([n, v]) => [n, typeof v === 'string' ? C(v) : v])));
const SKY = { top: C('#000'), hor: C('#000'), fog: C('#000'), sun: C('#000'), hemi: C('#000'), hemiG: C('#000'), ocean: C('#000'), sunI: 1, hemiI: 1, elev: 1, night: 0 };
function sky(t) {
  const p = mod(t / DAY, 1); let i = 0; while (KEYS[i + 1].p < p) i++;
  const a = KEYS[i], b = KEYS[i + 1], k = smooth((p - a.p) / (b.p - a.p));
  for (const n of Object.keys(SKY)) { if (SKY[n].isColor) SKY[n].copy(a[n]).lerp(b[n], k); else SKY[n] = a[n] + (b[n] - a[n]) * k; }
  return p;
}

// ---------------- geography ----------------
const coastX = z => 72 + 9 * Math.sin(z * .03) + 5 * Math.sin(z * .083 + 2) + Math.min(0, z + 160) * -.12;
const RCP = [[-640, -470], [-520, -380], [-400, -330], [-300, -250], [-215, -190], [-150, -120], [-95, -72], [-40, -42], [10, -22], [50, -6], [90, 8], [130, 18]];
const RIVER = [];
{
  const cr = (p0, p1, p2, p3, t) => .5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  const P = [RCP[0], ...RCP, RCP[RCP.length - 1]];
  for (let i = 1; i < P.length - 2; i++) for (let k = 0; k < 14; k++) {
    const t = k / 14; RIVER.push([cr(P[i - 1][0], P[i][0], P[i + 1][0], P[i + 2][0], t), cr(P[i - 1][1], P[i][1], P[i + 1][1], P[i + 2][1], t)]);
  }
  RIVER.push(RCP[RCP.length - 1]);
  let s = 0;
  for (let i = 0; i < RIVER.length; i++) {
    const [x, z] = RIVER[i], [nx, nz] = RIVER[Math.min(i + 1, RIVER.length - 1)], [px, pz] = RIVER[Math.max(i - 1, 0)];
    const dx = nx - px, dz = nz - pz, l = Math.hypot(dx, dz) || 1; if (i) s += Math.hypot(x - px, z - pz) / 2;
    const amp = x < -160 ? 26 : x < -60 ? 12 : 4, off = (fbm(s * .006 + 3, 1.7) - .5) * 2 * amp;
    RIVER[i] = [x - dz / l * off, z + dx / l * off, x > 60 ? 11 + (x - 60) * .18 : x > -110 ? 11 : 8];
  }
}
const RB = 50, rbuck = new Map();
for (let i = 0; i < RIVER.length - 1; i++) {
  const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
  for (let x = Math.floor(Math.min(ax, bx) / RB) - 2; x <= Math.floor(Math.max(ax, bx) / RB) + 2; x++)
    for (let z = Math.floor(Math.min(az, bz) / RB) - 2; z <= Math.floor(Math.max(az, bz) / RB) + 2; z++) {
      const k = x + ',' + z; if (!rbuck.has(k)) rbuck.set(k, []); rbuck.get(k).push(i);
    }
}
function river(x, z) {   // distance to the river's centre line, and its width there
  const segs = rbuck.get(Math.floor(x / RB) + ',' + Math.floor(z / RB)); let d = 1e9, w = 10;
  if (segs) for (const i of segs) {
    const [ax, az, aw] = RIVER[i], [bx, bz, bw] = RIVER[i + 1], dx = bx - ax, dz = bz - az;
    const k = clamp01(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)), dd = Math.hypot(x - ax - dx * k, z - az - dz * k);
    if (dd < d) { d = dd; w = aw + (bw - aw) * k; }
  }
  return { d, w };
}
const wet = (x, z, m = 0) => { const r = river(x, z); return r.d < r.w * .5 + m; };

// ---------------- the town's shape ----------------
const TC = { x: 14, z: 14 };                       // the market square, south of the river
const CASTLE = { x: -40, z: -84 };                 // the castle hill: inside the wall at the back, across the river
const PLAIN = .8;
// the wall's radius at each angle: a lumpy ring pulled in so it stays clear of the beach
const WALL_R = [];
for (let k = 0; k < 360; k++) {
  const a = k / 360 * TAU, ca = Math.atan2(CASTLE.z - TC.z, CASTLE.x - TC.x), toward = Math.max(0, Math.cos(a - ca)) ** 4;
  let r = 86 + (vnoise(Math.cos(a) * 1.1 + 4, Math.sin(a) * 1.1 + 4) - .5) * 46 + (vnoise(Math.cos(a) * 3 + 9, Math.sin(a) * 3) - .5) * 12 + 54 * toward + 14 * Math.sin(a * 2 + .7);
  while (r > 30 && TC.x + Math.cos(a) * r > coastX(TC.z + Math.sin(a) * r) - 9) r -= 1;
  WALL_R.push(r);
}
const wallR = a => WALL_R[Math.floor(mod(a, TAU) / TAU * 360) % 360];
const townD = (x, z) => Math.hypot(x - TC.x, z - TC.z) / wallR(Math.atan2(z - TC.z, x - TC.x));   // < 1 inside the wall
const angTo = (x, z) => Math.atan2(z - TC.z, x - TC.x), CASTLE_A = angTo(CASTLE.x, CASTLE.z);
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const slumAt = (x, z) => {   // the slum hugs the wall on the south-west, away from the castle road and the beach
  const d = townD(x, z), a = angTo(x, z);
  return d > 1.03 && d < 1.4 && angDiff(a, 2.2) < 1 && vnoise(x * .05 + 2, z * .05) > .38;
};
const PADS = [{ x: CASTLE.x, z: CASTLE.z, r: 20, h: 13 }];
const CASTLE_FACE = Math.atan2(TC.x - CASTLE.x, TC.z - CASTLE.z);
const CORRIDORS = [];
const corridorDist = (x, z) => {
  let best = 1e9;
  for (const c of CORRIDORS) for (let i = 0; i < c.length - 1; i++) {
    const [ax, az] = c[i], [bx, bz] = c[i + 1];
    if (Math.abs(x - ax) > 60 && Math.abs(x - bx) > 60) continue; if (Math.abs(z - az) > 60 && Math.abs(z - bz) > 60) continue;
    const dx = bx - ax, dz = bz - az, k = clamp01(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)); best = Math.min(best, Math.hypot(x - ax - dx * k, z - az - dz * k));
  }
  return best;
};
function height(x, z) {
  const dc = coastX(z) - x, { d, w } = river(x, z);
  let h;
  if (dc < 0) h = Math.max(-16, dc * .32 - .7 + (fbm(x * .05, z * .05) - .5) * 1.2);
  else {
    const flat = 1 - sstep(1.05, 1.6, townD(x, z));
    h = PLAIN * sstep(0, 4, dc);
    h += (1 - flat) * (fbm(x * .02 + 3, z * .02) * 9 - 2.5) * sstep(4, 30, dc);
    const mw = sstep(-130, -260, x), mb = sstep(-200, -380, z) * .85, m = Math.max(mw, mb) * (1 - flat) * sstep(16, 95, d);
    h += m * (8 + 95 * ridge(x * .011 + 7, z * .011)) * sstep(2, 40, dc);
    for (const q of PADS) { const pf = 1 - sstep(q.r, q.r + 22, Math.hypot(x - q.x, z - q.z)); h = Math.max(h * (1 - pf) + q.h * pf, h); }
    const cf = 1 - sstep(4, 12, corridorDist(x, z));
    h = h * (1 - cf) + Math.max(PLAIN, Math.min(h, PLAIN + 4)) * cf;
    h = Math.max(h, PLAIN * sstep(0, 4, dc));
  }
  const bank = w * .5 + 3 + Math.max(0, h) * .35, f = 1 - sstep(w * .5, bank, d);
  return h * (1 - f) + -1.4 * f;
}

// ---------------- streets ----------------
// Two main roads cross the river (the only two bridges): the castle road and a harbour street. The others leave the market
// through the gates and go on as dirt roads. Winding lanes branch off them and stop at the river, the wall, the castle hill
// or another street, so the plan is irregular, like a town that grew.
const STREETS = [];
const SB = 20, sbuck = new Map();
function street(pts, w, kind, bridge = false) {
  const n = STREETS.push({ pts, w, kind, bridge }) - 1;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    for (let x = Math.floor(Math.min(ax, bx) / SB) - 1; x <= Math.floor(Math.max(ax, bx) / SB) + 1; x++)
      for (let z = Math.floor(Math.min(az, bz) / SB) - 1; z <= Math.floor(Math.max(az, bz) / SB) + 1; z++) { const k = x + ',' + z; if (!sbuck.has(k)) sbuck.set(k, []); sbuck.get(k).push([n, i]); }
  }
}
function streetClear(x, z, m, skip = -1) {   // true when (x, z) is at least m beyond the edge of every street
  for (const [n, i] of sbuck.get(Math.floor(x / SB) + ',' + Math.floor(z / SB)) || []) {
    if (n === skip) continue;
    const s = STREETS[n], [ax, az] = s.pts[i], [bx, bz] = s.pts[i + 1], dx = bx - ax, dz = bz - az;
    const k = clamp01(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)); if (Math.hypot(x - ax - dx * k, z - az - dz * k) < s.w / 2 + m) return false;
  }
  return true;
}
const onHill = (x, z, m = 0) => Math.hypot(x - CASTLE.x, z - CASTLE.z) < PADS[0].r + m;
const at = (a, r) => [TC.x + Math.cos(a) * r, TC.z + Math.sin(a) * r];
const wiggle = (pts, amp, seed) => pts.map(([x, z], i) => i === 0 || i === pts.length - 1 ? [x, z] : [x + (vnoise(i * .7 + seed, 3) - .5) * amp, z + (vnoise(3, i * .7 + seed) - .5) * amp]);
{
  // the castle road: across the river and up to the castle gate on the hill's town side
  const gate = [CASTLE.x + Math.sin(CASTLE_FACE) * (PADS[0].r - 2), CASTLE.z + Math.cos(CASTLE_FACE) * (PADS[0].r - 2)];
  street(wiggle([[TC.x, TC.z], [TC.x - 6, TC.z - 20], [-4, -30], [-14, -50], [gate[0] + 10, gate[1] + 14], gate], 6, 1), 4.4, 'main', true);
  // a harbour street across the river near its mouth, on to the north gate and the coast road north
  const north = [[34, TC.z - 4], [40, -20], [44, -44], [40, -70]];
  for (let z = -90; z >= -900; z -= 12) { const w = sstep(-90, -190, z); north.push([40 * (1 - w) + (coastX(z) - 48) * w, z]); }
  street(wiggle([[TC.x, TC.z], [22, TC.z - 2], ...north], 4, 2), 4.2, 'main', true);
  // south along the coast, west up the valley's south bank, east to the quay
  const south = [[TC.x, TC.z], [TC.x - 4, TC.z + 24]]; for (let z = TC.z + 46; z <= 420; z += 12) { const w = sstep(TC.z + 60, TC.z + 170, z); south.push([(TC.x - 10) * (1 - w) + (coastX(z) - 44) * w, z]); }
  street(wiggle(south, 5, 3), 4.2, 'main');
  const west = [[TC.x, TC.z], [-20, TC.z + 6], [-50, 8], [-80, 4]];
  for (let i = RIVER.length - 1; i >= 0; i--) { const [x, z] = RIVER[i]; if (x > -100 || x < -560) continue; west.push([x + 4, z + 30]); }
  street(wiggle(west, 5, 4), 4, 'main');
  street([[TC.x, TC.z], [36, TC.z + 6], [coastX(TC.z + 10) - 6, TC.z + 10]], 4, 'main');
  // winding lanes off every street in town, both sides, every so often
  R = rng(17);
  const grow = (x, z, h, depth) => {
    const pts = [[x, z]], n = STREETS.length;
    for (let s = 0; s < 22; s++) {
      h += (vnoise(x * .05 + depth, z * .05) - .5) * .7; x += Math.sin(h) * 3; z += Math.cos(h) * 3;
      if (townD(x, z) > .9 || wet(x, z, 3) || onHill(x, z, 6) || (s > 2 && !streetClear(x, z, 2.5))) break;
      pts.push([x, z]);
    }
    if (pts.length > 4) { street(pts, 3, 'lane'); if (depth < 2) for (let i = 3; i < pts.length - 2; i += 5) if (R() < .6) { const [px, pz] = pts[i], [qx, qz] = pts[i + 1], hh = Math.atan2(qx - px, qz - pz) + (R() < .5 ? 1 : -1) * (Math.PI / 2 + rr(-.3, .3)); grow(px + Math.sin(hh) * 2.5, pz + Math.cos(hh) * 2.5, hh, depth + 1); } }
  };
  for (const s of STREETS.slice()) for (let i = 0; i < s.pts.length - 1; i++) {
    const [ax, az] = s.pts[i], [bx, bz] = s.pts[i + 1], L = Math.hypot(bx - ax, bz - az), hd = Math.atan2(bx - ax, bz - az);
    for (let u = 8 + R() * 10; u < L; u += 14 + R() * 12) {
      const x = ax + (bx - ax) * u / L, z = az + (bz - az) * u / L; if (townD(x, z) > .85) continue;
      const side = R() < .5 ? 1 : -1, h = hd + side * (Math.PI / 2 + rr(-.35, .35));
      grow(x + Math.sin(h) * (s.w / 2 + .5), z + Math.cos(h) * (s.w / 2 + .5), h, 0);
    }
  }
}
CORRIDORS.push(...STREETS.filter(s => s.kind === 'main').map(s => s.pts));

// ---------------- renderer, scene, camera ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: CAPTURE });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY.fog, 240, 1100);
const camera = new THREE.PerspectiveCamera(38, 1, 1, 4000);
const sunDir = new THREE.Vector3(.7, .4, -.5).normalize();
const hemi = new THREE.HemisphereLight('#fff', '#888', 1); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff', 1); scene.add(sun, sun.target);
const U = {
  fogC: { value: scene.fog.color }, fogN: { value: scene.fog.near }, fogF: { value: scene.fog.far },
  sunD: { value: sunDir }, sunC: { value: C('#fff') }, amb: { value: C('#fff') }, night: { value: 0 }, phase: { value: 0 }, skyHor: { value: C('#fff') },
};
const FOG_GLSL = `uniform vec3 fogC; uniform float fogN, fogF;
vec3 fogged(vec3 c, vec3 w) { return mix(c, fogC, smoothstep(fogN, fogF, length(w - cameraPosition))); }`;
const NOISE_GLSL = `float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float h31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1., 0., 0.)), f.x), mix(h31(i + vec3(0., 1., 0.)), h31(i + vec3(1., 1., 0.)), f.x), f.y),
             mix(mix(h31(i + vec3(0., 0., 1.)), h31(i + vec3(1., 0., 1.)), f.x), mix(h31(i + vec3(0., 1., 1.)), h31(i + vec3(1., 1., 1.)), f.x), f.y), f.z); }`;
const _o = new THREE.Object3D();
const NIGHT_GLOW = [];

// ---------------- sky ----------------
const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: SKY.top }, hor: { value: SKY.hor }, sunC: { value: SKY.sun }, sunD: U.sunD, night: U.night },
  vertexShader: `varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position.z = gl_Position.w; }`,
  fragmentShader: `uniform vec3 top, hor, sunC, sunD; uniform float night; varying vec3 vD;
    ${NOISE_GLSL}
    void main() { vec3 d = normalize(vD); float h = max(d.y, 0.);
      vec3 c = mix(hor, top, pow(h, .55));
      float s = max(dot(d, normalize(sunD)), 0.);
      c += sunC * (pow(s, 900.) * 2. * (1. - night * .5) + pow(s, 14.) * .22 + pow(s, 3.) * .07);
      vec2 g = floor(vec2(atan(d.z, d.x) * 300., d.y * 300.)); c += vec3(step(.996, h21(g)) * smoothstep(.04, .4, h) * night * .8);
      gl_FragColor = vec4(c, 1.);
      #include <colorspace_fragment>
    }` });
{ const s = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), skyMat); s.renderOrder = -10; scene.add(s); }

// ---------------- terrain: flat-shaded, coloured per face ----------------
function terrain() {
  const X0 = -780, X1 = 300, Z0 = -1050, Z1 = 280, Sg = 3.2, nx = Math.ceil((X1 - X0) / Sg), nz = Math.ceil((Z1 - Z0) / Sg);
  const H = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) H[j * (nx + 1) + i] = height(X0 + i * Sg, Z0 + j * Sg);
  const pos = new Float32Array(nx * nz * 18), col = new Float32Array(nx * nz * 18), c = new THREE.Color();
  const cols = Object.fromEntries(Object.entries(GROUND).map(([k, v]) => [k, C(v)]));
  let p = 0;
  const face = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx_ = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz_ = ux * vy - uy * vx, ny1 = Math.abs(ny) / Math.hypot(nx_, ny, nz_);
    const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3, jit = hash2(mx * .7, mz * .7), td = townD(mx, mz);
    if (my < -.25) c.copy(cols.shallow).lerp(cols.deep, clamp01(-my / 9));
    else if (my < 1.6 && coastX(mz) - mx < 7) c.copy(cols.sand);
    else if (td < .99 && my < 1.6) c.copy(cols.cobble).lerp(cols.grass, jit * .12);
    else if (slumAt(mx, mz) && my < 3) c.copy(cols.dirt).lerp(cols.grass, jit * .3);
    else if (my < 2.4 && wet(mx, mz, 3.2)) c.copy(cols.sand).lerp(cols.grass, .4);
    else if (my > 62 + jit * 18 && ny1 > .55) c.copy(cols.snow);
    else if (ny1 < .72) c.copy(cols.rock).lerp(cols.forest, jit * .25);
    else if (my > 14) c.copy(cols.forest).lerp(cols.rock, clamp01((my - 30) / 40));
    else if (td < 2.1 && my < 10 && ny1 > .93 && vnoise(mx * .02, mz * .02 + 5) > .3) c.copy(FIELDS[Math.floor(hash2(Math.floor(mx / 16), Math.floor(mz / 11)) * FIELDS.length)]);   // fields
    else c.copy(jit > .5 ? cols.grass : cols.grass2);
    c.multiplyScalar(.95 + jit * .1);
    for (const [x, y, z] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]) { pos[p] = x; pos[p + 1] = y; pos[p + 2] = z; col[p] = c.r; col[p + 1] = c.g; col[p + 2] = c.b; p += 3; }
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = X0 + i * Sg, z = Z0 + j * Sg, a = H[j * (nx + 1) + i], b = H[j * (nx + 1) + i + 1], d = H[(j + 1) * (nx + 1) + i], e = H[(j + 1) * (nx + 1) + i + 1];
    face(x, a, z, x, d, z + Sg, x + Sg, b, z); face(x + Sg, b, z, x, d, z + Sg, x + Sg, e, z + Sg);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
}

// ---------------- ocean ----------------
const oceanMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
  uniforms: { deep: { value: SKY.ocean }, sky: { value: SKY.hor }, ...U },
  vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 deep, sky, sunC, sunD; uniform float phase, night; varying vec3 vW;
    ${NOISE_GLSL} ${FOG_GLSL}
    void main() { vec3 v = normalize(cameraPosition - vW); vec2 p = vW.xz;
      vec2 o1 = vec2(cos(phase), sin(phase)) * 2.5, o2 = vec2(sin(phase * 3.), cos(phase * 3.)) * 1.3;
      float w1 = n2(p * .06 + o1), w2 = n2(p * .22 + o2), w = w1 * .6 + w2 * .4;
      vec3 n = normalize(vec3((w1 - .5) * .35 + (w2 - .5) * .2, 1., (n2(p * .09 - o1) - .5) * .35 + (n2(p * .3 - o2) - .5) * .15));
      float fres = pow(1. - max(dot(n, v), 0.), 4.);
      vec3 c = mix(deep * (.85 + w * .3), sky, .1 + fres * .55);
      vec3 r = reflect(-v, n); float s = max(dot(r, normalize(sunD)), 0.);
      c += sunC * (pow(s, 260.) * 2.2 + pow(s, 30.) * .18) * (1. - night * .6);
      c = fogged(c, vW);
      float shore = smoothstep(-8., 50., vW.x - 72.);
      gl_FragColor = vec4(c, max(mix(.62, 1., shore), fres));
      #include <colorspace_fragment>
    }` });
{ const o = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), oceanMat); scene.add(o); }

// ---------------- models ----------------
const loader = new GLTFLoader(), LIB = {};
async function kenney(path) {   // one merged, base-centred geometry per model; each triangle's UVs averaged so it reads one flat swatch colour
  if (LIB[path]) return LIB[path];
  const g = await loader.loadAsync(`models/${path}.glb`); g.scene.updateMatrixWorld(true);
  const geos = []; let map = null;
  g.scene.traverse(m => { if (m.isMesh) { const x = m.geometry.clone().applyMatrix4(m.matrixWorld); for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k); geos.push(x.index ? x.toNonIndexed() : x); map = map || m.material.map; } });
  const geo = mergeGeometries(geos); geo.computeBoundingBox();
  const b = geo.boundingBox; geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); geo.computeBoundingBox();
  const uv = geo.attributes.uv;
  if (uv) for (let i = 0; i < uv.count; i += 3) { const u = (uv.getX(i) + uv.getX(i + 1) + uv.getX(i + 2)) / 3, v = (uv.getY(i) + uv.getY(i + 1) + uv.getY(i + 2)) / 3; for (let k = 0; k < 3; k++) uv.setXY(i + k, u, v); }
  if (map) { map.colorSpace = THREE.SRGBColorSpace; map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestFilter; map.generateMipmaps = false; }
  return (LIB[path] = { geo, map, w: b.max.x - b.min.x, d: b.max.z - b.min.z, h: b.max.y - b.min.y });
}
// the kit's colours, flat and a little softened; its blue swatches become the building's roof colour (instance colour);
// dark window slits glow at night; new buildings are frosted until their paint lands
const KIT_V = `uniform vec3 tint; varying vec3 vW, vN, vRoof; varying vec2 vUv;
void main() { vUv = uv; mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
  m = m * instanceMatrix;
  #endif
  vec4 w = m * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(m) * normal);
  #ifdef USE_INSTANCING_COLOR
  vRoof = instanceColor;
  #else
  vRoof = tint;
  #endif
  gl_Position = projectionMatrix * viewMatrix * w; }`;
const KIT_F = `uniform sampler2D map; uniform vec3 hit, sunD, sunC, amb, paint; uniform float reveal, cut, seed, night, glass;
varying vec3 vW, vN, vRoof; varying vec2 vUv;
${NOISE_GLSL} ${FOG_GLSL}
void main() {
  if (vW.y > cut) discard;
  vec3 n = normalize(vN), base = texture2D(map, vUv).rgb; float lum = dot(base, vec3(.299, .587, .114));
  float diff = max(dot(n, normalize(sunD)), 0.); vec3 light = amb + sunC * diff;
  bool roof = base.b > base.r + .12 && base.b > base.g + .05;
  vec3 col = roof ? vRoof * (.8 + .45 * lum) : mix(base, vec3(.98, .94, .86), .16);
  vec3 c = col * light;
  if (lum < .16 && abs(n.y) < .5) c = mix(c, vec3(1., .78, .48) * 1.1, night * step(.35, h31(floor(vW * 1.3))));
  if (glass > .5) {
    float d = distance(vW, hit), rag = (n3(vW * 1.6 + seed) - .5) * 1.6 * (.25 + min(reveal, 3.) / 3.) + (n3(vW * 5. + seed) - .5) * .5;
    float m = 1. - smoothstep(reveal - .1, reveal, d + rag), wetE = smoothstep(reveal - .8, reveal - .05, d + rag) * m * (1. - smoothstep(6., 14., reveal));
    c = mix(vec3(.88, .89, .93) * light, c, m); c = mix(c, paint * light * 1.1, wetE * .85);
  }
  c = mix(c, vec3(1., .82, .5), (1. - smoothstep(0., .25, cut - vW.y)) * step(cut, 900.));
  gl_FragColor = vec4(fogged(c, vW), 1.);
  #include <colorspace_fragment>
}`;
const kitMat = (map, o = {}) => new THREE.ShaderMaterial({ vertexShader: KIT_V, fragmentShader: KIT_F,
  uniforms: { map: { value: map }, tint: { value: o.tint || C(ROOFS.castle[0]) }, hit: { value: new THREE.Vector3() }, reveal: { value: 99 }, cut: { value: 9999 },
    seed: { value: R() * 40 }, glass: { value: o.glass ? 1 : 0 }, paint: { value: C('#fff') }, ...U } });
// instanced placement: put() records a piece, flush() makes one instanced mesh per model
const INST = new Map();
const put = (model, x, y, z, rot = 0, s = 1, roof = ROOFS.castle[0]) => { if (!INST.has(model)) INST.set(model, []); INST.get(model).push({ x, y, z, rot, s: [s, s, s], roof: C(roof) }); };
const putS = (model, x, y, z, rot, s3) => { if (!INST.has(model)) INST.set(model, []); INST.get(model).push({ x, y, z, rot, s: s3, roof: C(ROOFS.castle[0]) }); };
async function flush() {
  for (const [model, list] of INST) {
    const k = await kenney(model), m = new THREE.InstancedMesh(k.geo, kitMat(k.map), list.length);
    list.forEach((p, i) => { _o.position.set(p.x, p.y, p.z); _o.rotation.set(0, p.rot, 0); _o.scale.set(...p.s); _o.updateMatrix(); m.setMatrixAt(i, _o.matrix); m.setColorAt(i, p.roof); });
    scene.add(m);
  }
  INST.clear();
}
let VARIANTS = {};
async function loadVariants() {
  const m = await (await fetch('models/variants/manifest.json')).json();
  for (const v of m.variants) (VARIANTS[v.set] ||= []).push('variants/' + v.name);
}

// ---------------- streets and bridges ----------------
function streetMeshes() {
  const cob = [], dirt = [], bridge = [], rail = [];
  const yAt = (x, z) => townD(x, z) < 1.02 ? PLAIN + .06 + 1.1 * (1 - sstep(0, 5, river(x, z).d - river(x, z).w * .5)) : Math.max(PLAIN, height(x, z)) + .12;
  for (const s of STREETS) {
    for (let i = 0; i < s.pts.length - 1; i++) {
      const [ax, az] = s.pts[i], [bx, bz] = s.pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 3)), px = -(bz - az) / L, pz = (bx - ax) / L, W = s.w / 2;
      for (let k = 0; k < n; k++) {
        const u0 = k / n, u1 = (k + 1) / n, x0 = ax + (bx - ax) * u0, z0 = az + (bz - az) * u0, x1 = ax + (bx - ax) * u1, z1 = az + (bz - az) * u1;
        const y0 = yAt(x0, z0), y1 = yAt(x1, z1), inside = townD((x0 + x1) / 2, (z0 + z1) / 2) < 1.02;
        if (!s.bridge && wet((x0 + x1) / 2, (z0 + z1) / 2, .5)) continue;
        const up = (x, z, y) => onHill(x, z, 24) ? Math.max(y, height(x, z) + .12) : y;
        const ya = up(x0, z0, y0), yb = up(x1, z1, y1);
        (inside ? cob : dirt).push(x0 + px * W, ya, z0 + pz * W, x0 - px * W, ya, z0 - pz * W, x1 + px * W, yb, z1 + pz * W, x1 + px * W, yb, z1 + pz * W, x0 - px * W, ya, z0 - pz * W, x1 - px * W, yb, z1 - pz * W);
        if (inside && wet((x0 + x1) / 2, (z0 + z1) / 2, 1.5)) {   // a stone deck and parapets where the street crosses the river
          const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cy = (y0 + y1) / 2, yaw = Math.atan2(bx - ax, bz - az), l = L / n + .05;
          bridge.push(new THREE.BoxGeometry(s.w + .6, .6, l).rotateY(yaw).translate(cx, cy - .32, cz));
          for (const sd of [-1, 1]) bridge.push(new THREE.BoxGeometry(.35, .55, l).rotateY(yaw).translate(cx + px * sd * (W + .2), cy + .25, cz + pz * sd * (W + .2)));
          if (k % 2 === 0) bridge.push(new THREE.BoxGeometry(s.w * .8, cy + 1.5, 1.1).rotateY(yaw).translate(cx, (cy - 1.5) / 2 - .3, cz));
        }
      }
    }
  }
  const mk = (arr, color) => { if (!arr.length) return; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals(); scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }))); };
  mk(cob, '#cbbba8'); mk(dirt, '#c4a987');
  if (bridge.length) scene.add(new THREE.Mesh(mergeGeometries(bridge.map(b => { b = b.toNonIndexed(); b.deleteAttribute('uv'); return b; })), new THREE.MeshLambertMaterial({ color: '#d8cfc4' })));
}

// ---------------- the wall, its towers and gates ----------------
const KW = 3.6;   // wall scale (one wall piece = 3.6 units)
function townWall() {
  // the ring sampled finely; towers ("ballasts") every 24-40 units, always at the gates and on both river banks;
  // between two towers one wall piece stretched to span the whole gap
  const ring = []; for (let k = 0; k < 720; k++) { const a = k / 720 * TAU, [x, z] = at(a, wallR(a)); ring.push({ x, z, wet: wet(x, z, 2) }); }
  const gates = STREETS.filter(s => s.kind === 'main').map(s => { for (let i = 0; i < s.pts.length - 1; i++) { const a = s.pts[i], b = s.pts[i + 1]; if (townD(...a) < 1 && townD(...b) >= 1) for (let u = 0; u <= 1; u += .02) { const x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u; if (townD(x, z) >= 1) return [x, z]; } } return null; }).filter(Boolean);
  const gateAt = new Set(gates.map(([gx, gz]) => ring.reduce((b, p, i) => Math.hypot(p.x - gx, p.z - gz) < Math.hypot(ring[b].x - gx, ring[b].z - gz) ? i : b, 0)));
  const ball = []; let run = 0, next = 30;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length]; run += Math.hypot(q.x - p.x, q.z - p.z);
    const bank = p.wet !== ring[(i + ring.length - 1) % ring.length].wet;
    if (gateAt.has(i)) { ball.push({ i, gate: true }); run = 0; next = 24 + hash2(i, 1) * 16; }
    else if (!p.wet && (bank || run >= next)) { ball.push({ i }); run = 0; next = 24 + hash2(i, 2) * 16; }
  }
  for (let n = 0; n < ball.length; n++) {
    const A = ring[ball[n].i], B = ring[ball[(n + 1) % ball.length].i];
    if (A.wet || B.wet || wet((A.x + B.x) / 2, (A.z + B.z) / 2, 1)) continue;
    const L = Math.hypot(B.x - A.x, B.z - A.z), yaw = Math.atan2(B.x - A.x, B.z - A.z) + Math.PI / 2;
    putS('castle/wall', (A.x + B.x) / 2, PLAIN, (A.z + B.z) / 2, yaw, [L, KW, KW]);
  }
  for (const b of ball) {
    const p = ring[b.i], q = ring[(b.i + 1) % ring.length], yaw = Math.atan2(q.x - p.x, q.z - p.z) + Math.PI / 2;
    if (b.gate) { put('castle/tower-square-arch', p.x, PLAIN, p.z, yaw + Math.PI / 2, KW * 1.25); put('castle/tower-square-top-roof-high', p.x, PLAIN + KW * 1.25 * 1.31, p.z, yaw, KW * 1.25); torch(p.x, PLAIN + KW * 1.3, p.z); }
    else { const s = KW * (1.15 + hash2(b.i, 5) * .25); put('castle/tower-base', p.x, PLAIN, p.z, yaw, s); put(hash2(b.i, 6) < .5 ? 'castle/tower-square-top-roof' : 'castle/tower-top', p.x, PLAIN + s * 1.31, p.z, yaw, s); torch(p.x, PLAIN + s * 1.5, p.z); }
  }
}
const TORCHES = [];
const torch = (x, y, z) => TORCHES.push([x, y, z]);

// ---------------- the castle on the hill ----------------
function castle() {
  const K = 3.6, cx = CASTLE.x, cz = CASTLE.z, y0 = PADS[0].h + .4 - .2, face = CASTLE_FACE;
  const rot = (lx, lz) => [cx + lx * Math.cos(face) + lz * Math.sin(face), cz - lx * Math.sin(face) + lz * Math.cos(face)];
  const N = 4;   // curtain wall: 2N pieces a side, a tower at each corner, a gatehouse facing the town
  for (let i = -N; i <= N; i++) for (const [lx, lz, r] of [[i, -N, 0], [i, N, 0], [-N, i, Math.PI / 2], [N, i, Math.PI / 2]]) {
    const [x, z] = rot(lx * K, lz * K), yaw = face + r, corner = Math.abs(i) === N;
    if (corner) { put('castle/tower-base', x, y0, z, yaw, K * 1.15); put('castle/tower-square-mid-windows', x, y0 + K * 1.15 * 1.31, z, yaw, K * 1.05); put('castle/tower-square-top-roof-high', x, y0 + K * 1.15 * 1.31 + K * 1.05 * 1.01, z, yaw, K * 1.1); torch(x, y0 + K * 2.6, z); }
    else if (lz === N && i === 0) { put('castle/tower-square-arch', x, y0, z, yaw + Math.PI / 2, K * 1.2); put('castle/tower-square-top-roof', x, y0 + K * 1.2 * 1.31, z, yaw, K * 1.2); put('castle/flag-banner-long', x, y0 + K * 2.8, z, yaw, K); }
    else put('castle/wall', x, y0, z, yaw, K);
  }
  // the keep: a tall square tower with a high roof, two hexagonal towers beside it, flags on top
  const k = K * 1.9; let y = y0;
  for (const p of ['castle/tower-square-base-border', 'castle/tower-square-mid-windows', 'castle/tower-square-mid', 'castle/tower-square-mid-windows']) { put(p, cx, y, cz, face, k); y += k * 1.01; }
  put('castle/tower-square-top-roof-high-windows', cx, y, cz, face, k); put('castle/flag', cx, y + k * 1.3, cz, face, K * 1.4);
  for (const sd of [-1, 1]) {
    const [x, z] = rot(sd * K * 2.2, -K * .5); let hy = y0;
    put('castle/tower-hexagon-base', x, hy, z, face, K * 1.5); hy += K * 1.5 * 1.31;
    for (let m = 0; m < 3; m++) { put('castle/tower-hexagon-mid', x, hy, z, face, K * 1.5); hy += K * 1.5 * .46; }
    put('castle/tower-hexagon-roof', x, hy, z, face, K * 1.5); put('castle/flag-pennant', x, hy + K * 1.4, z, face, K);
  }
  torch(cx, y0 + K * 3, cz);
}

// ---------------- houses ----------------
const HK = 3.1;   // house scale: one tower piece = 3.1 units
const occ = new Set(), okey = (x, z) => Math.floor(x / 1.6) + ',' + Math.floor(z / 1.6);
const free = (x, z, r) => { for (let dx = -r; dx <= r; dx += 1.6) for (let dz = -r; dz <= r; dz += 1.6) if (occ.has(okey(x + dx, z + dz))) return false; return true; };
const take = (x, z, r) => { for (let dx = -r; dx <= r; dx += 1.6) for (let dz = -r; dz <= r; dz += 1.6) occ.add(okey(x + dx, z + dz)); };
const district = (x, z) => {
  const d = Math.hypot(x - TC.x, z - TC.z);
  if (d < 16) return 'market';
  if (angDiff(angTo(x, z), CASTLE_A) < .9) return 'noble';
  if (x > 34) return 'harbor';
  return 'artisan';
};
const PICK = { noble: [['tallhouse', .4], ['hall', .14], ['wide', .16], ['house', .3]], artisan: [['house', .62], ['wide', .2], ['tallhouse', .18]], harbor: [['wide', .55], ['house', .45]] };
const houses = [];
function planHouses() {
  R = rng(41);
  for (const s of STREETS) {
    if (s.kind === 'main' && false) continue;
    for (let i = 0; i < s.pts.length - 1; i++) {
      const [ax, az] = s.pts[i], [bx, bz] = s.pts[i + 1], L = Math.hypot(bx - ax, bz - az), px = -(bz - az) / L, pz = (bx - ax) / L;
      for (let u = 0; u < L; u += 3.4) for (const side of [-1, 1]) for (const row of [0, 1]) {
        const off = s.w / 2 + 1.9 + row * 3.6, x = ax + (bx - ax) * u / L + px * side * off, z = az + (bz - az) * u / L + pz * side * off;
        const td = townD(x, z); if (td > .95 || Math.hypot(x - TC.x, z - TC.z) < 17 || wet(x, z, 4) || onHill(x, z, 8) || !streetClear(x, z, 1.4)) continue;
        const dist = district(x, z); if (dist === 'market') continue;
        let set = 'house', roll = R(); for (const [sname, w] of PICK[dist]) { if ((roll -= w) <= 0) { set = sname; break; } }
        const r = set === 'wide' ? 3.2 : set === 'hall' ? 2.4 : 1.6;
        if (!free(x, z, r)) { if (set === 'wide' && free(x, z, 1.6)) set = 'house'; else continue; }
        take(x, z, set === 'wide' ? 3.2 : set === 'hall' ? 2.4 : 1.6);
        const list = VARIANTS[set], model = list[Math.floor(R() * list.length)];
        houses.push({ x, z, rot: Math.atan2(-px * side, -pz * side) + (set === 'wide' ? 0 : 0), set, model, dist, roof: pk(ROOFS[dist]), s: HK * (set === 'hall' ? 1.25 : 1) });
      }
    }
  }
}
function fillLots() {
  R = rng(43);
  for (let k = 0; k < 6000; k++) {
    const a = rr(0, TAU), r = rr(18, wallR(a) * .93), x = TC.x + Math.cos(a) * r, z = TC.z + Math.sin(a) * r;
    if (wet(x, z, 4) || onHill(x, z, 8) || !streetClear(x, z, 1.4) || !free(x, z, 1.6)) continue;
    const dist = district(x, z); if (dist === 'market') continue;
    take(x, z, 1.6);
    const list = VARIANTS[R() < .2 ? 'tallhouse' : 'house'], face = Math.round((Math.atan2(TC.x - x, TC.z - z) + rr(-.3, .3)) / (Math.PI / 2)) * Math.PI / 2;
    houses.push({ x, z, rot: face, set: 'house', model: list[Math.floor(R() * list.length)], dist, roof: pk(ROOFS[dist]), s: HK });
  }
}
function market() {   // stalls around the square, a guild hall and trees
  R = rng(8);
  for (let k = 0; k < 14; k++) { const a = k / 14 * TAU + rr(-.1, .1), r = rr(8, 12.5), x = TC.x + Math.cos(a) * r, z = TC.z + Math.sin(a) * r; if (!streetClear(x, z, .6)) continue; put(pk(VARIANTS.stall), x, PLAIN, z, Math.atan2(TC.x - x, TC.z - z), HK * .9); }
  put(VARIANTS.hall[2], TC.x + 5, PLAIN, TC.z - 5, .4, HK * 1.6, ROOFS.noble[0]);
}
function slum() {   // shacks in clumps outside the south-west wall, with barrels and fences
  R = rng(77); let n = 0;
  for (let k = 0; k < 4000 && n < 230; k++) {
    const a = rr(1.2, 3.4), r = wallR(a) * rr(1.05, 1.42), x = TC.x + Math.cos(a) * r, z = TC.z + Math.sin(a) * r;
    if (!slumAt(x, z) || wet(x, z, 4) || !streetClear(x, z, 2) || !free(x, z, 1.6)) continue;
    const h = height(x, z); if (Math.abs(height(x + 2, z) - h) + Math.abs(height(x, z + 2) - h) > 1.2) continue;
    take(x, z, 1.6); n++;
    put(pk(VARIANTS.shack), x, h - .1, z, rr(0, TAU), HK * rr(.9, 1.1), pk(['#b5a08a', '#a89480', '#9f8f86']));
    if (R() < .4) put('minidungeon/barrel', x + rr(-2, 2), h, z + rr(-2, 2), 0, HK * .8);
  }
}

// ---------------- trees ----------------
async function trees() {
  const spots = [];
  R = rng(5);
  for (let k = 0; k < 900; k++) {   // gardens in the noble quarter and odd trees in town
    const a = rr(0, TAU), r = rr(18, 1) * 0 + rr(18, 80), x = TC.x + Math.cos(a) * r, z = TC.z + Math.sin(a) * r;
    if (townD(x, z) > .93 || !streetClear(x, z, 1) || !free(x, z, .8) || wet(x, z, 3) || onHill(x, z, -2)) continue;
    if (district(x, z) !== 'noble' && R() > .25) continue;
    take(x, z, .8); spots.push([x, z, rr(.5, .75), R() < .4]);
  }
  for (let k = 0; k < 14000 && spots.length < 5200; k++) {
    const x = rr(-430, 70), z = rr(-600, 160), h = height(x, z), td = townD(x, z);
    if (h < 1.5 || h > 48 || td < 1.08 || coastX(z) - x < 6 || corridorDist(x, z) < 5 || slumAt(x, z)) continue;
    if (onHill(x, z, 8) || wet(x, z, 3)) continue;
    const e = .3, sl = Math.abs(height(x + e, z) - h) + Math.abs(height(x, z + e) - h);
    if (sl > .45 || fbm(x * .03, z * .03) < (td < 2.1 ? .5 : .42)) continue;
    spots.push([x, z, rr(1, 2.1) * (1 + h / 60), R() < .03]);
  }
  const cone = mergeGeometries([new THREE.ConeGeometry(.9, 2.6, 6).translate(0, 2.1, 0), new THREE.CylinderGeometry(.18, .22, 1, 5).translate(0, .5, 0)].map(g => { g = g.toNonIndexed(); g.deleteAttribute('uv'); return g; }));
  const round = mergeGeometries([new THREE.IcosahedronGeometry(1.1, 0).translate(0, 2.1, 0), new THREE.CylinderGeometry(.16, .2, 1.2, 5).translate(0, .6, 0)].map(g => { g = g.toNonIndexed(); g.deleteAttribute('uv'); return g; }));
  for (const [geo, filter] of [[cone, s => s[2] > .9 && !s[3]], [round, s => s[2] <= .9 || s[3]]]) {
    const list = spots.filter(filter); if (!list.length) continue;
    const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), list.length), c = new THREE.Color();
    list.forEach(([x, z, s, bloom], i) => {
      _o.position.set(x, Math.max(PLAIN, height(x, z)) - .1, z); _o.scale.set(s, s * rr(.85, 1.25), s); _o.rotation.set(0, rr(0, TAU), 0); _o.updateMatrix(); m.setMatrixAt(i, _o.matrix);
      m.setColorAt(i, c.copy(bloom ? pk(BLOSSOM) : pk(TREES)).multiplyScalar(rr(.9, 1.08)));
    });
    scene.add(m);
  }
}
function torches() {   // warm glows on the towers, lit at night
  const g = new THREE.InstancedMesh(new THREE.SphereGeometry(.45, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffc27a', transparent: true, opacity: 0 }), TORCHES.length);
  TORCHES.forEach(([x, y, z], i) => { _o.position.set(x, y, z); _o.rotation.set(0, 0, 0); _o.scale.setScalar(1); _o.updateMatrix(); g.setMatrixAt(i, _o.matrix); });
  scene.add(g); NIGHT_GLOW.push(g.material);
}

// ---------------- clouds ----------------
const clouds = [];
function makeClouds() {
  R = rng(21);
  const m = new THREE.MeshLambertMaterial({ color: '#fff8f2', flatShading: true, transparent: true, emissive: '#fff4ee', emissiveIntensity: .35 });
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    for (let k = 0; k < 5; k++) { const p = new THREE.Mesh(new THREE.IcosahedronGeometry(rr(5, 10), 0), m.clone()); p.position.set(rr(-12, 12), rr(-2, 3), rr(-6, 6)); p.scale.y = .6; g.add(p); }
    scene.add(g); clouds.push({ g, x: rr(-500, 200), y: rr(80, 135), z: rr(-700, 60), per: rr(70, 140), o: R() });
  }
}
function updateClouds(t) {
  for (const c of clouds) {
    const k = mod(t / c.per + c.o, 1), a = sstep(0, .15, k) * (1 - sstep(.85, 1, k));
    c.g.position.set(c.x + k * 70, c.y, c.z); c.g.children.forEach(p => { p.material.opacity = a * .9; p.visible = a > .01; p.material.emissiveIntensity = .35 - SKY.night * .2; });
  }
}

// ---------------- houses that come down and go up ----------------
// each changing house has its own period and two events per period: A comes down and B goes up, later B comes down and
// A goes up. An event: demolish (taken down floor by floor, or dropped into dust) → empty → build → frosted → paint.
const DUR = { decon: 4, implode: 2.6, empty: 1.4, hold: 1, fly: .7, paint: 1.8 };
const dyn = [];
const blobGeo = new THREE.IcosahedronGeometry(1, 1);
async function buildHouses() {
  R = rng(33);
  const changing = [];
  for (const h of houses) { if (R() < .07) changing.push(h); else put(h.model, h.x, PLAIN, h.z, h.rot, h.s, h.roof); }
  for (const h of changing) {
    const r = rng(Math.floor(hash2(h.x, h.z) * 1e9)), list = VARIANTS[h.set], other = list[Math.floor(r() * list.length)];
    const objs = [];
    for (const [n, model] of [h.model, other].entries()) {
      const k = await kenney(model), m = new THREE.Mesh(k.geo, kitMat(k.map, { glass: true, tint: C(n ? pk(ROOFS[h.dist]) : h.roof) }));
      m.position.set(h.x, PLAIN, h.z); m.rotation.y = h.rot; m.scale.setScalar(h.s); scene.add(m); m.userData.h = k.h * h.s; objs.push(m);
    }
    const per = 70 + r() * 110, s0 = r() * per;
    const ev = [0, 1].map(i => ({ start: mod(s0 + i * (per / 2 + (r() - .5) * per * .2), per), demo: r() < .35 ? 'implode' : 'decon', build: Math.min(10, 2 + Math.ceil(objs[1 - i].userData.h / 2.4) * .75), from: i, to: 1 - i, paint: pk(BRIGHT), seed: r() }));
    const hs = objs.map(o => o.userData.h), ks = await Promise.all([h.model, other].map(kenney));
    const sc = scaffold(Math.max(...ks.map(k => k.w)) * h.s + .9, Math.max(...ks.map(k => k.d)) * h.s + .9, Math.max(...hs) + .8);
    sc.position.set(h.x, PLAIN, h.z); sc.rotation.y = h.rot; scene.add(sc);
    const blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ color: '#fff' })); blob.visible = false; scene.add(blob);
    const drops = [...Array(8)].map((_, i) => { const d = new THREE.Mesh(blobGeo, blob.material); d.visible = false; scene.add(d); return { d, v: new THREE.Vector3(Math.cos(i * .8) * 2.2, 2 + hash2(i, 1) * 2, Math.sin(i * .8) * 2.2) }; });
    dyn.push({ l: h, objs, hs, ev, per, sc, dust: dustRig(), blob, drops });
  }
}
function scaffold(w, d, h) {   // wooden scaffolding around a house: corner and mid poles, plank decks every storey, cross braces
  const parts = [], wood = (x0, y0, z0, x1, y1, z1, t = .12) => {   // a beam from one point to another
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz), g = new THREE.BoxGeometry(t, L, t);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize())));
    parts.push(g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).toNonIndexed());
  };
  const xs = [-w / 2, 0, w / 2], zs = [-d / 2, 0, d / 2];
  for (const x of xs) for (const z of zs) if (Math.abs(x) === w / 2 || Math.abs(z) === d / 2) wood(x, 0, z, x, h, z);
  for (let y = 1.6; y < h + .1; y += 1.6) {
    for (const z of [-d / 2, d / 2]) { wood(-w / 2, y, z, w / 2, y, z, .1); parts.push(new THREE.BoxGeometry(w + .3, .08, .55).translate(0, y, z + Math.sign(z) * .3).toNonIndexed()); }
    for (const x of [-w / 2, w / 2]) { wood(x, y, -d / 2, x, y, d / 2, .1); parts.push(new THREE.BoxGeometry(.55, .08, d + .3).translate(x + Math.sign(x) * .3, y, 0).toNonIndexed()); }
    wood(-w / 2, y - 1.6, d / 2, 0, y, d / 2, .07); wood(0, y - 1.6, -d / 2, w / 2, y, -d / 2, .07);   // braces
  }
  const g = mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); return p; }));
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#b48d6c' })); m.visible = false; return m;
}
const dustMat = new THREE.MeshLambertMaterial({ color: '#efe4d6', flatShading: true, transparent: true, emissive: '#efe4d6', emissiveIntensity: .3 });
function dustRig() {
  const g = new THREE.Group(), puffs = [];
  for (let i = 0; i < 12; i++) { const p = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), dustMat.clone()); g.add(p); puffs.push({ p, a: i / 12 * TAU + hash2(i, 3), r: .6 + hash2(i, 7) }); }
  g.visible = false; scene.add(g); return { g, puffs };
}
function updateDust(d, x, z, k, size) {
  d.g.visible = k > 0 && k < 1; if (!d.g.visible) return;
  d.g.position.set(x, PLAIN, z);
  for (const q of d.puffs) {
    const r = size * (.4 + ease(k) * 1.1) * q.r, s = size * (.35 + .5 * ease(k)) * (.6 + q.r * .4);
    q.p.position.set(Math.cos(q.a) * r, s * .5 + k * size * .8, Math.sin(q.a) * r); q.p.scale.setScalar(s); q.p.material.opacity = (1 - easeIn(k)) * .85;
  }
}
const steps = h => Math.max(2, Math.min(10, Math.round(h / 2.2)));
function stepped(k, h) { const n = steps(h), x = clamp01(k) * n, f = Math.floor(x); return Math.min(1, (f + smooth((x - f - .55) / .35)) / n); }
const evLen = e => DUR[e.demo] + DUR.empty + e.build + DUR.hold + DUR.fly + DUR.paint;
function updateChanging(t) {
  const cam = camera.position;
  for (const D of dyn) {
    const lt = mod(t, D.per); let e = D.ev[0], dt = mod(lt - D.ev[0].start, D.per); const dt1 = mod(lt - D.ev[1].start, D.per);
    if (dt1 < dt) { e = D.ev[1]; dt = dt1; }
    const l = D.l, len = evLen(e), active = dt < len;
    const tDemo = DUR[e.demo], tEmpty = tDemo + DUR.empty, tBuild = tEmpty + e.build, tFly = tBuild + DUR.hold, tPaint = tFly + DUR.fly;
    const oFrom = D.objs[e.from], oTo = D.objs[e.to], hFrom = D.hs[e.from], hTo = D.hs[e.to], uF = oFrom.material.uniforms, uT = oTo.material.uniforms;
    for (const o of D.objs) { o.visible = false; o.position.set(l.x, PLAIN, l.z); }
    D.blob.visible = false; D.drops.forEach(q => (q.d.visible = false)); D.dust.g.visible = false;
    if (!active || dt >= tBuild) {
      oTo.visible = true; uT.cut.value = 9999; uT.paint.value.copy(e.paint);
      const dir = new THREE.Vector3(cam.x - l.x, 0, cam.z - l.z).normalize();
      uT.hit.value.set(l.x, PLAIN + hTo * (.45 + e.seed * .3), l.z).addScaledVector(dir, 1.6);
      uT.reveal.value = !active ? 99 : dt < tPaint ? 0 : (4 + hTo) * 1.3 * ease((dt - tPaint) / DUR.paint);
      const k = (dt - tFly) / DUR.fly, hit = uT.hit.value;
      if (active && k > 0 && k < 1) {
        const from = new THREE.Vector3(hit.x + 18, hit.y + 26, hit.z + 10), p = from.lerp(hit, k); p.y += Math.sin(k * Math.PI) * 6;
        D.blob.visible = true; D.blob.position.copy(p); D.blob.scale.setScalar(.7); D.blob.material.color.copy(e.paint);
      }
      const kd = (dt - tPaint) / .7;
      if (active && kd > 0 && kd < 1) D.drops.forEach(q => { q.d.visible = true; q.d.position.copy(hit).addScaledVector(q.v, kd * 1.4); q.d.position.y -= 5 * kd * kd; q.d.scale.setScalar(.3 * (1 - kd)); });
    } else if (dt < tDemo) {
      const k = dt / DUR[e.demo];
      oFrom.visible = true; uF.reveal.value = 99;
      if (e.demo === 'implode') {
        const sink = easeIn((k - .15) / .85);
        oFrom.position.y = PLAIN - sink * hFrom * 1.02; oFrom.position.x = l.x + Math.sin(dt * 47) * .1 * (1 - sink) * (k > .05 ? 1 : 0);
        uF.cut.value = PLAIN + hFrom * 1.2;
        updateDust(D.dust, l.x, l.z, (k - .1) / 1.1, 2.6);
      } else uF.cut.value = PLAIN + hFrom * (1 - stepped(k, hFrom));
    } else if (dt < tEmpty) {
      if (e.demo === 'implode') updateDust(D.dust, l.x, l.z, (dt - DUR.implode * .1) / (DUR.implode * 1.1), 2.6);
    } else {
      const k = (dt - tEmpty) / e.build, c = stepped(k, hTo);
      oTo.visible = true; uT.reveal.value = 0; uT.cut.value = PLAIN + hTo * c;
    }
    const up = e.demo === 'implode' ? sstep(tDemo, tEmpty, dt) : sstep(-.6, .6, dt), down = 1 - sstep(tBuild, tBuild + 1, dt), show = active ? Math.min(up, down) : 0;
    D.sc.visible = show > .01; D.sc.scale.set(1, Math.max(.01, show), 1);
  }
}

// ---------------- boats ----------------
const boats = [];
function makeBoats() {   // sailing boats: a hull, a mast and a pastel sail
  const parts = [new THREE.BoxGeometry(1.4, .7, 4.2).translate(0, .2, 0), new THREE.ConeGeometry(.7, 1.6, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).scale(1, .5, 1).translate(0, .25, 2.9), new THREE.CylinderGeometry(.06, .06, 4.5, 5).translate(0, 2.6, .2)];
  const hull = mergeGeometries(parts.map(g => { g = g.toNonIndexed(); g.deleteAttribute('uv'); return g; }));
  const sailG = new THREE.BufferGeometry(); sailG.setAttribute('position', new THREE.Float32BufferAttribute([0, 4.7, .25, 0, .9, .25, 0, .9, -1.9], 3)); sailG.computeVertexNormals();
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group(); g.add(new THREE.Mesh(hull, new THREE.MeshLambertMaterial({ color: '#a07a62' })), new THREE.Mesh(sailG, new THREE.MeshLambertMaterial({ color: i % 2 ? '#fbf1c7' : PASTEL[i % PASTEL.length], side: THREE.DoubleSide })));
    g.scale.setScalar(i < 3 ? 2 : 1.2); scene.add(g); boats.push({ m: g, i, per: 50 + i * 13 });
  }
}
function updateBoats(t) {
  const town = RIVER.filter(([x]) => x > -10);
  for (const b of boats) {
    const k = mod(t / b.per, 1);
    if (b.i < 3) { const a = TAU * (k + b.i / 3); b.m.position.set(190 + Math.cos(a) * 60, .1, -140 + Math.sin(a) * 220); b.m.rotation.y = -a; }
    else if (b.i < 5) {
      const kk = mod(k + (b.i - 3) * .5, 1), pp = kk < .5 ? kk * 2 : 2 - kk * 2, s = smooth(pp) * (town.length - 1), f = Math.min(town.length - 2, Math.floor(s)), q = s - f;
      const [ax, az] = town[f], [bx, bz] = town[f + 1];
      b.m.position.set(ax + (bx - ax) * q, .05, az + (bz - az) * q); b.m.rotation.y = Math.atan2(bx - ax, bz - az) + (kk < .5 ? 0 : Math.PI);
    } else { const a = TAU * (k + b.i); b.m.position.set(118 + Math.cos(a) * 18 + (b.i - 5) * 30, .05, 40 + Math.sin(a) * 12); b.m.rotation.y = -a; }
  }
}

// ---------------- camera ----------------
let aspect = 16 / 9;
const CAMS = {   // [position, look-at] for landscape; portrait backs off and widens
  a: [[112, 56, 104], [-20, 4, -40]],    // three-quarter from over the bay, the castle behind the town
  b: [[96, 26, 128], [-8, 8, -50]],      // low along the beach
  c: [[176, 72, 2], [-28, 4, -40]],      // across the bay
};
function placeCamera(t) {
  if (Q.has('top')) { const [tx, tz, th] = (Q.get('top') || '-10,-20,330').split(',').map(Number); camera.fov = 50; camera.position.set(tx, th, tz + .01); camera.lookAt(tx, 0, tz); camera.aspect = aspect; camera.updateProjectionMatrix(); return; }
  if (Q.has('focus')) { const h = dyn[+Q.get('focus')].l; camera.fov = 40; camera.position.set(h.x + 14, PLAIN + 12, h.z + 18); camera.lookAt(h.x, PLAIN + 4, h.z); camera.aspect = aspect; camera.updateProjectionMatrix(); return; }   // debug: look at one changing house
  const [p, l] = CAMS[CAM], a = TAU * t / 150, portrait = aspect < 1, back = portrait ? 1.45 : 1;
  camera.fov = portrait ? 56 : 40;
  camera.position.set(l[0] + (p[0] - l[0]) * back + Math.sin(a) * 10, p[1] * back, l[2] + (p[2] - l[2]) * back + Math.cos(a) * 5);
  camera.lookAt(l[0], l[1], l[2]); camera.aspect = aspect; camera.updateProjectionMatrix();
}

// ---------------- the day ----------------
function updateSky(t) {
  const p = sky(t), az = TAU * (p * .5 + .1), el = Math.max(.06, SKY.elev);
  sunDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), -Math.sin(az) * Math.cos(el) * .6 - .4).normalize();
  sun.position.copy(sunDir).multiplyScalar(300); sun.color.copy(SKY.sun); sun.intensity = SKY.sunI;
  hemi.color.copy(SKY.hemi); hemi.groundColor.copy(SKY.hemiG); hemi.intensity = SKY.hemiI;
  scene.fog.color.copy(SKY.fog);
  U.sunC.value.copy(SKY.sun).multiplyScalar(SKY.sunI * .75); U.amb.value.copy(SKY.hemi).multiplyScalar(SKY.hemiI * .62); U.night.value = SKY.night; U.skyHor.value.copy(SKY.hor);
  for (const m of NIGHT_GLOW) m.opacity = sstep(.3, .9, SKY.night);
}

// ---------------- go ----------------
function size() { const w = innerWidth, h = innerHeight; aspect = w / h; renderer.setSize(w, h, false); }
addEventListener('resize', size); size();
terrain();
await loadVariants();
streetMeshes(); townWall(); castle(); planHouses(); fillLots(); market(); slum(); await buildHouses(); await flush(); await trees(); torches(); makeClouds(); makeBoats();
function frame(t) {
  U.phase.value = TAU * mod(t, 60) / 60;
  updateSky(t); placeCamera(t); updateChanging(t); updateClouds(t); updateBoats(t);
  renderer.render(scene, camera);
}
window.__frame = frame;
window.__info = () => ({ ev: dyn.slice(0, 4).map(d => [+d.per.toFixed(1), +d.ev[0].start.toFixed(1), +d.ev[1].start.toFixed(1)]), houses: houses.length, changing: dyn.length, calls: renderer.info.render.calls, tris: renderer.info.render.triangles });
if (!CAPTURE) { const t0 = performance.now(); renderer.setAnimationLoop(() => frame((performance.now() - t0) / 1000)); }
else frame(Number(Q.get('t') || 0));
window.__ready = true;
