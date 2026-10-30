// The title screen's city: a coastal city with real streets on a plain, the ocean on one side, mountains on the other, a
// river winding out of a wide valley through the city to the sea, a railway along the coast through the middle of town and
// highways leaving north, south and up the valley. Downtown towers thin out to mid-rise, low-rise and then houses with yards.
// Every moving thing runs on its own loop (buildings swapping, traffic, the train, boats, clouds, and a pastel day/night
// cycle), with periods that don't line up, so the view rarely repeats exactly.
// ?cam=a|b|c picks the framing; ?capture stops the clock and window.__frame(t) draws time t (for recording).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as JP from './japan.js';

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
// buildings keep to gruvbox's light tones; the bright gruvbox pastels go everywhere else (cars, train, boats, trees, paint, sky)
const CALM = ['#f4e6c0', '#e5cba2', '#e9bba8', '#d2a28c', '#bcc6a6', '#adc0c2'].map(C);   // cream, sand, blush, muted terracotta, sage, dusty blue
const BRIGHT = ['#fb4934', '#fabd2f', '#b8bb26', '#83a598', '#d3869b', '#8ec07c', '#fe8019'].map(C);
const PASTEL = BRIGHT.map(c => c.clone().lerp(C('#fbf1c7'), .35));
const TREES = ['#98a86a', '#8ab07f', '#a3b46a', '#7fa38a', '#b0b98a'].map(C), BLOSSOM = ['#eeb2c2', '#e8a0b4', '#f3c4cf', '#e8916e', '#e07a5a'].map(C);   // cherry blossom and maple
const GROUND = { sand: '#ecd9b4', grass: '#b3bf95', grass2: '#a5b58f', forest: '#8aa08a', rock: '#b0a3a8', snow: '#f7f1ee', shallow: '#a3d4c6', deep: '#5d7fa8', pave: '#d9d3c6', park: '#b2c08f' };
// the day: keyframes around the cycle, each a pastel sky; values blend between neighbours
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
// the river: one smooth curve through a few control points, a slow noise meander, widening toward the mouth
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
// segment buckets so river() stays cheap
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
const CX = 12, CZ = -18;   // downtown
const zoneD = (x, z) => Math.hypot((x - CX) / 104, (z - CZ) / 118) + (vnoise(x * .025 + 9, z * .025) - .5) * .22;
const PLAIN = .8;
const PADS = [{ x: -112, z: -150, r: 16, h: 9 }, { x: -124, z: 22, r: 14, h: 10 }];   // terraces: the temple hill, the castle hill
const CORRIDORS = [];   // highways and the railway outside town: the land is flattened along them
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
    const flat = 1 - sstep(.95, 1.25, zoneD(x, z));
    h = PLAIN * sstep(0, 4, dc);
    h += (1 - flat) * (fbm(x * .02 + 3, z * .02) * 9 - 2.5) * sstep(4, 30, dc);
    const mw = sstep(-120, -250, x), mb = sstep(-180, -360, z) * .85, m = Math.max(mw, mb) * (1 - flat) * sstep(16, 95, d);   // a wide valley along the river
    h += m * (8 + 95 * ridge(x * .011 + 7, z * .011)) * sstep(2, 40, dc);
    const cf = 1 - sstep(5, 16, corridorDist(x, z));
    h = h * (1 - cf) + PLAIN * cf;
    for (const q of PADS) { const pf = 1 - sstep(q.r, q.r + 20, Math.hypot(x - q.x, z - q.z)); h = h * (1 - pf) + q.h * pf; }
    h = Math.max(h, PLAIN * sstep(0, 4, dc));
  }
  const bank = w * .5 + 3 + Math.max(0, h) * .35, f = 1 - sstep(w * .5, bank, d);
  return h * (1 - f) + -1.4 * f;
}

// ---------------- the street plan ----------------
// one cell = one Kenney road tile. Avenues run north-south every 3 cells (blocks are two buildings deep, so every building
// fronts a street), cross streets every 6 cells. Some avenues bridge the river; the railway has its own column.
const S = 5, I0 = -30, I1 = 16, J0 = -36, J1 = 28;
const RAIL_I = 7, BRIDGE_I = new Set([-18, -6, 6, 12]);
const cells = new Map(), key = (i, j) => i + ',' + j, cellAt = (i, j) => cells.get(key(i, j));
for (let i = I0; i <= I1; i++) for (let j = J0; j <= J1; j++) {
  const x = i * S, z = j * S, zd = zoneD(x, z);
  if (zd >= 1 || coastX(z) - x < S * 1.1) continue;
  const rv = river(x, z), water = rv.d < rv.w * .5 + S * .5;
  const ns = mod(i, 3) === 0, ew = mod(j, 6) === 0;
  let type;
  if (i === RAIL_I) type = water ? 'railbridge' : ew ? 'crossing' : 'rail';
  else if (water) type = ns && BRIDGE_I.has(i) ? 'bridge' : 'water';
  else if (ns || ew) type = 'road';
  else type = 'lot';
  cells.set(key(i, j), { i, j, x, z, zd, type });
}
const roadish = c => c && (c.type === 'road' || c.type === 'bridge' || c.type === 'crossing');
// drop bridges whose far side has no street
for (const c of cells.values()) if (c.type === 'bridge') {
  let a = c.j, b = c.j; while (cellAt(c.i, a - 1)?.type === 'bridge') a--; while (cellAt(c.i, b + 1)?.type === 'bridge') b++;
  if (!roadish(cellAt(c.i, a - 1)) || !roadish(cellAt(c.i, b + 1))) c.type = 'water';
}

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
const U = {   // uniforms every custom shader shares; updated each frame from the sky
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

// ---------------- corridors (set before the terrain is built) ----------------
const railX = z => { const w = sstep(-260, -170, z) * (1 - sstep(130, 220, z)); return RAIL_I * S * w + (coastX(z) - 26) * (1 - w); };
const RAIL = []; for (let z = -900; z <= 420; z += 6) RAIL.push([railX(z), z]);
const HWY_N = [], HWY_S = [], HWY_V = [];
{ // north and south highways leave the end of the avenue at i = 3 and follow the coast; the valley road runs up the river's north bank
  const hx = 3 * S;
  for (let z = -900; z <= -150; z += 8) { const w = sstep(-260, -170, z); HWY_N.push([hx * w + (coastX(z) - 48) * (1 - w), z]); }
  for (let z = 125; z <= 420; z += 8) { const w = 1 - sstep(130, 220, z); HWY_S.push([hx * w + (coastX(z) - 44) * (1 - w), z]); }
  HWY_V.push([-120, -60]);
  for (let i = RIVER.length - 1; i >= 0; i--) { const [x, z] = RIVER[i]; if (x > -150 || x < -560) continue; HWY_V.push([x, z - 26]); }
}
CORRIDORS.push(RAIL.filter(([, z]) => z < -150 || z > 125), HWY_N, HWY_S, HWY_V);

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
    const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3, jit = hash2(mx * .7, mz * .7), zd = zoneD(mx, mz);
    if (my < -.25) c.copy(cols.shallow).lerp(cols.deep, clamp01(-my / 9));
    else if (my < 1.6 && coastX(mz) - mx < 7) c.copy(cols.sand);
    else if (zd < .66 && my < 1.5) c.copy(cols.pave).lerp(cols.park, jit * .15);
    else if (my < 2.4 && river(mx, mz).d < river(mx, mz).w * .5 + 3.2) c.copy(cols.sand).lerp(cols.grass, .4);
    else if (my > 62 + jit * 18 && ny1 > .55) c.copy(cols.snow);
    else if (ny1 < .72) c.copy(cols.rock).lerp(cols.forest, jit * .25);
    else if (my > 14) c.copy(cols.forest).lerp(cols.rock, clamp01((my - 30) / 40));
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
async function kenney(path) {   // one merged, base-centred geometry per model, with its colour-map texture
  if (LIB[path]) return LIB[path];
  const g = await loader.loadAsync(`models/${path}.glb`); g.scene.updateMatrixWorld(true);
  const geos = []; let map = null;
  g.scene.traverse(m => { if (m.isMesh) { const x = m.geometry.clone().applyMatrix4(m.matrixWorld); for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k); geos.push(x.index ? x.toNonIndexed() : x); map = map || m.material.map; } });
  const geo = mergeGeometries(geos); geo.computeBoundingBox();
  const b = geo.boundingBox; geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); geo.computeBoundingBox();
  if (map) { map.colorSpace = THREE.SRGBColorSpace; map.magFilter = THREE.NearestFilter; }
  return (LIB[path] = { geo, map, w: b.max.x - b.min.x, d: b.max.z - b.min.z, h: b.max.y - b.min.y });
}
const range = (p, a, z) => [...Array(z.charCodeAt(0) - a.charCodeAt(0) + 1)].map((_, i) => p + String.fromCharCode(a.charCodeAt(0) + i));
const SETS = { industry: range('industrial/building-', 'a', 't') };   // the port keeps Kenney's industrial kit

// buildings, houses, cars and the train share one shader. The colour map's gradient swatches are flattened: each surface
// gets one flat tone (wall, trim, dark detail) of the building's single tint. Windows are flat sky colour by day and glow by
// night. New buildings are frosted until their paint lands.
const PAINT_V = `uniform vec3 tint; varying vec3 vW, vN, vTint; varying vec2 vUv; varying float vSeed;
void main() { vUv = uv; mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
  m = m * instanceMatrix;
  #endif
  vec4 w = m * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(m) * normal);
  #ifdef USE_INSTANCING_COLOR
  vTint = instanceColor;
  #else
  vTint = tint;
  #endif
  vSeed = fract(sin(dot(m[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
  gl_Position = projectionMatrix * viewMatrix * w; }`;
const PAINT_F = `uniform sampler2D map; uniform vec3 hit, sunD, sunC, amb, skyHor, paint; uniform float reveal, cut, seed, night, glass;
varying vec3 vW, vN, vTint; varying vec2 vUv; varying float vSeed;
${NOISE_GLSL} ${FOG_GLSL}
void main() {
  if (vW.y > cut) discard;
  vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
  vec3 base = texture2D(map, vec2(floor(vUv.x * 16.) / 16. + .03, vUv.y)).rgb;   // sample the swatch, not its gradient
  float lum = dot(base, vec3(.299, .587, .114));
  float diff = max(dot(n, normalize(sunD)), 0.);
  vec3 light = amb + sunC * diff;
  bool win = base.b > base.r + .07 && base.b > base.g + .02 && abs(n.y) < .5;   // the colour map's blue swatches are windows
  float tone = lum > .6 ? 1. : lum > .42 ? .88 : lum > .25 ? .74 : .56;
  vec3 c = vTint * tone * light;
  if (win) {
    float lit = step(.68, h31(floor(vW * vec3(1.6, 1.2, 1.6)) + vSeed * 9.));
    vec3 dayWin = skyHor * .6 + vec3(.05, .07, .11), nightWin = mix(skyHor * .3, vec3(.98, .8, .58) * .85, lit);
    c = mix(dayWin, nightWin, night);
  }
  if (glass > .5) {
    float d = distance(vW, hit), rag = (n3(vW * 1.6 + seed) - .5) * 1.6 * (.25 + min(reveal, 3.) / 3.) + (n3(vW * 5. + seed) - .5) * .5;
    float m = 1. - smoothstep(reveal - .1, reveal, d + rag);
    float wet = smoothstep(reveal - .8, reveal - .05, d + rag) * m * (1. - smoothstep(6., 14., reveal));
    vec3 frost = vec3(.86, .87, .92) * light * (.9 + .15 * tone);
    c = mix(frost, c, m); c = mix(c, paint * light * 1.1, wet * .85);
  }
  float seam = (1. - smoothstep(0., .25, cut - vW.y)) * step(cut, 900.);
  c = mix(c, vec3(1., .82, .5), seam);
  gl_FragColor = vec4(fogged(c, vW), 1.);
  #include <colorspace_fragment>
}`;
const paintMat = (map, o = {}) => new THREE.ShaderMaterial({ vertexShader: PAINT_V, fragmentShader: PAINT_F,
  uniforms: { map: { value: map }, tint: { value: o.tint || C('#fff') }, hit: { value: new THREE.Vector3() }, reveal: { value: 99 }, cut: { value: 9999 },
    seed: { value: R() * 40 }, glass: { value: o.glass ? 1 : 0 }, paint: { value: C('#fff') }, ...U } });

// ---------------- streets ----------------
// avenues (every third column) carry the cars: asphalt between sidewalks with a dashed line. Cross streets are stone-paved
// lanes with lantern strings overhead. Power poles and sagging wires line the avenues.
const _o = new THREE.Object3D();
const NIGHT_GLOW = [], LANTERNS = [];
const vcMat = () => new THREE.MeshLambertMaterial({ vertexColors: true });
const lineGeo = arr => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return g; };
class Flat {
  constructor() { this.p = []; this.c = []; }
  rect(x0, z0, x1, z1, y, col) { const k = C(col); this.p.push(x0, y, z0, x0, y, z1, x1, y, z0, x1, y, z0, x0, y, z1, x1, y, z1); for (let i = 0; i < 6; i++) this.c.push(k.r, k.g, k.b); }
  mesh() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.computeVertexNormals(); return new THREE.Mesh(g, vcMat()); }
}
const isAve = c => mod(c.i, 3) === 0;
async function streets() {
  const f = new Flat(), h = S / 2;
  for (const c of cells.values()) {
    if (!roadish(c)) continue;
    const y = PLAIN + .04 + (c.type === 'bridge' ? .9 : 0), x0 = c.x - h, x1 = c.x + h, z0 = c.z - h, z1 = c.z + h, lane = mod(c.j, 6) === 0;
    if (isAve(c)) {
      f.rect(x0, z0, x1, z1, y, '#d3c9be');
      f.rect(c.x - h * .68, z0, c.x + h * .68, z1, y + .01, '#a39b93');
      if (lane) f.rect(x0, c.z - h * .68, x1, c.z + h * .68, y + .01, '#a39b93');
      else if (mod(c.j, 2) === 0) f.rect(c.x - .08, z0 + .6, c.x + .08, z1 - .6, y + .02, '#f2e5bc');
    } else f.rect(x0, z0, x1, z1, y, '#dcc8b8');
  }
  scene.add(f.mesh());
  bridgeParts(); streetProps();
}
function streetProps() {
  // power poles every other cell along each avenue, three wires sagging between neighbours
  const poles = [], wires = [];
  for (let i = I0; i <= I1; i++) if (mod(i, 3) === 0) {
    let prev = null;
    for (let j = J0; j <= J1; j++) {
      const c = cellAt(i, j); if (!c || c.type !== 'road') { prev = null; continue; }
      if (mod(j, 2)) continue;
      const p = [c.x + S * .44, c.z]; poles.push(p);
      if (prev) for (const k of [-.6, 0, .6]) for (let s = 0; s < 6; s++) {
        const pt = u => [prev[0] + k + (p[0] - prev[0]) * u, PLAIN + 5.5 - Math.sin(u * Math.PI) * .55, prev[1] + (p[1] - prev[1]) * u];
        wires.push(...pt(s / 6), ...pt((s + 1) / 6));
      }
      prev = p;
    }
  }
  const pm = new THREE.InstancedMesh(JP.pole(6), vcMat(), poles.length);
  poles.forEach(([x, z], i) => { _o.position.set(x, PLAIN, z); _o.rotation.set(0, 0, 0); _o.scale.setScalar(1); _o.updateMatrix(); pm.setMatrixAt(i, _o.matrix); });
  scene.add(pm, new THREE.LineSegments(lineGeo(wires), new THREE.LineBasicMaterial({ color: '#5e5450' })));
  // lantern strings across the lanes, glowing at night
  const lan = [], cords = [];
  for (const c of cells.values()) if (roadish(c) && !isAve(c) && mod(c.j, 6) === 0 && c.zd < .85) for (const off of [-.25, .25]) {
    const x = c.x + off * S, y = u => PLAIN + 4.3 - Math.sin(u * Math.PI) * .5;
    for (let s = 0; s < 8; s++) { const u = s / 8, v = (s + 1) / 8; cords.push(x, y(u), c.z - S / 2 + u * S, x, y(v), c.z - S / 2 + v * S); }
    for (let s = 0; s < 4; s++) { const u = (s + .5) / 4; lan.push([x, y(u) - .3, c.z - S / 2 + u * S]); }
  }
  const lm = new THREE.InstancedMesh(new THREE.CylinderGeometry(.17, .17, .38, 8), new THREE.MeshBasicMaterial({ color: '#e0705a' }), lan.length);
  lan.forEach(([x, y, z], i) => { _o.position.set(x, y, z); _o.updateMatrix(); lm.setMatrixAt(i, _o.matrix); });
  scene.add(lm, new THREE.LineSegments(lineGeo(cords), new THREE.LineBasicMaterial({ color: '#6b5d55' }))); LANTERNS.push(lm.material);
}
function bridgeParts() {   // stone decks and piers under every bridge run; the central bridge gets vermilion rails
  const stone = [], red = [], runs = [];
  const runAt = (i, type) => { const out = []; let a = null; for (let j = J0; j <= J1 + 1; j++) { const ok = cellAt(i, j)?.type === type; if (ok && a === null) a = j; if (!ok && a !== null) { out.push([a, j - 1]); a = null; } } return out; };
  for (const i of [...BRIDGE_I, RAIL_I]) for (const [a, b] of runAt(i, i === RAIL_I ? 'railbridge' : 'bridge')) runs.push([i, a, b]);
  for (const [i, a, b] of runs) {
    const x = i * S, z0 = (a - .5) * S, z1 = (b + .5) * S, len = z1 - z0, mid = (z0 + z1) / 2, y = PLAIN + .9, rails = i === 6 ? red : stone;
    stone.push(new THREE.BoxGeometry(S * 1.02, .7, len).translate(x, y - .35, mid));
    for (const s of [-1, 1]) {
      rails.push(new THREE.BoxGeometry(.18, .12, len).translate(x + s * S * .5, y + .7, mid));
      for (let z = z0 + .5; z <= z1 - .4; z += 1.4) rails.push(new THREE.BoxGeometry(.16, .7, .16).translate(x + s * S * .5, y + .35, z));
    }
    for (let z = z0 + S * .5; z < z1; z += S * 1.5) stone.push(new THREE.BoxGeometry(S * .7, y + 1.4, .9).translate(x, (y - 1.4) / 2 - .35, z));
  }
  // a vermilion arched footbridge across the river between the avenues
  const k = RIVER.reduce((b, p, n) => Math.abs(p[0] + 33) < Math.abs(RIVER[b][0] + 33) ? n : b, 0), [rx, rz, rw] = RIVER[k];
  const dx = RIVER[k + 1][0] - RIVER[k - 1][0], dz = RIVER[k + 1][1] - RIVER[k - 1][1], l = Math.hypot(dx, dz), px = -dz / l, pz = dx / l, span = rw + 8, yaw = Math.atan2(px, pz);
  for (let s = 0; s < 14; s++) {
    const u0 = s / 14, u1 = (s + 1) / 14, um = (u0 + u1) / 2, arc = u => PLAIN + .2 + Math.sin(u * Math.PI) * 2.4;
    const cx = rx + px * (um - .5) * span, cz = rz + pz * (um - .5) * span, cy = (arc(u0) + arc(u1)) / 2, pitch = Math.atan2(arc(u1) - arc(u0), span / 14);
    const m = new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationX(-pitch));
    stone.push(new THREE.BoxGeometry(2.2, .25, span / 14 + .05).applyMatrix4(m).translate(cx, cy, cz));
    for (const sd of [-1, 1]) red.push(new THREE.BoxGeometry(.14, .14, span / 14 + .05).applyMatrix4(m).translate(cx + Math.cos(yaw) * sd * 1.05, cy + .65, cz - Math.sin(yaw) * sd * 1.05),
      new THREE.BoxGeometry(.12, .65, .12).translate(cx + Math.cos(yaw) * sd * 1.05, cy + .32, cz - Math.sin(yaw) * sd * 1.05));
  }
  const add = (list, color) => { if (!list.length) return; const g = mergeGeometries(list.map(p => { p = p.index ? p.toNonIndexed() : p; if (p.attributes.uv) p.deleteAttribute('uv'); return p; })); scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }))); };
  add(stone, '#e3d9cc'); add(red, '#e0705a');
}

// highways outside town: a ribbon that follows the land, with a dashed centre line
const HWAYS = [];
function highway(pts) {
  const sm = []; for (let i = 0; i < pts.length; i++) { const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[Math.min(pts.length - 1, i + 1)]; sm.push([(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4]); }
  const pos = [], dash = [], W = 2.3, yAt = (x, z) => Math.max(PLAIN, height(x, z)) + .12;
  for (let i = 0; i < sm.length - 1; i++) {
    const [ax, az] = sm[i], [bx, bz] = sm[i + 1], l = Math.hypot(bx - ax, bz - az), px = -(bz - az) / l, pz = (bx - ax) / l, ya = yAt(ax, az), yb = yAt(bx, bz);
    pos.push(ax + px * W, ya, az + pz * W, ax - px * W, ya, az - pz * W, bx + px * W, yb, bz + pz * W, bx + px * W, yb, bz + pz * W, ax - px * W, ya, az - pz * W, bx - px * W, yb, bz - pz * W);
    if (i % 2 === 0) { const w = .12; dash.push(ax + px * w, ya + .03, az + pz * w, ax - px * w, ya + .03, az - pz * w, bx + px * w, yb + .03, bz + pz * w, bx + px * w, yb + .03, bz + pz * w, ax - px * w, ya + .03, az - pz * w, bx - px * w, yb + .03, bz - pz * w); }
  }
  const mk = (arr, color) => { const g = lineGeo(arr); g.computeVertexNormals(); scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }))); };
  mk(pos, '#a39b93'); mk(dash, '#f2e5bc');
  HWAYS.push(sm.map(([x, z]) => [x, yAt(x, z), z]));
}

// ---------------- buildings ----------------
// procedural Japanese buildings (japan.js) with flat vertex colours; paper windows, lanterns and signs glow at night
const JP_V = `attribute float emit; varying vec3 vW, vN, vCol; varying float vEmit;
void main() { vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vCol = color; vEmit = emit; gl_Position = projectionMatrix * viewMatrix * w; }`;
const JP_F = `uniform vec3 hit, sunD, sunC, amb, paint; uniform float reveal, cut, seed, night, glass; varying vec3 vW, vN, vCol; varying float vEmit;
${NOISE_GLSL} ${FOG_GLSL}
void main() {
  if (vW.y > cut) discard;
  vec3 n = normalize(vN); float diff = max(dot(n, normalize(sunD)), 0.); vec3 light = amb + sunC * diff;
  vec3 c = vCol * light;
  if (vEmit > 0.) {
    float lit = vEmit > .99 ? 1. : step(.45, h31(floor(vW * vec3(1.3, .8, 1.3))));
    c = mix(c, vCol * 1.15 + vec3(.1, .05, 0.), night * lit);
  }
  if (glass > .5) {
    float d = distance(vW, hit), rag = (n3(vW * 1.6 + seed) - .5) * 1.6 * (.25 + min(reveal, 3.) / 3.) + (n3(vW * 5. + seed) - .5) * .5;
    float m = 1. - smoothstep(reveal - .1, reveal, d + rag), wet = smoothstep(reveal - .8, reveal - .05, d + rag) * m * (1. - smoothstep(6., 14., reveal));
    c = mix(vec3(.88, .89, .93) * light, c, m); c = mix(c, paint * light * 1.1, wet * .85);
  }
  c = mix(c, vec3(1., .82, .5), (1. - smoothstep(0., .25, cut - vW.y)) * step(cut, 900.));
  gl_FragColor = vec4(fogged(c, vW), 1.);
  #include <colorspace_fragment>
}`;
const jpMat = (o = {}) => new THREE.ShaderMaterial({ vertexShader: JP_V, fragmentShader: JP_F, vertexColors: true,
  uniforms: { hit: { value: new THREE.Vector3() }, reveal: { value: 99 }, cut: { value: 9999 }, seed: { value: R() * 40 }, glass: { value: o.glass ? 1 : 0 }, paint: { value: C('#fff') }, ...U } });
const lots = [];
function planLots() {
  for (const c of cells.values()) {
    if (c.type !== 'lot') continue;
    const face = roadish(cellAt(c.i - 1, c.j)) ? [-1, 0] : roadish(cellAt(c.i + 1, c.j)) ? [1, 0] : roadish(cellAt(c.i, c.j - 1)) ? [0, -1] : roadish(cellAt(c.i, c.j + 1)) ? [0, 1] : [0, 1];
    const rot = Math.atan2(face[0], face[1]);
    const block = hash2(Math.floor(c.i / 3) * 3.1, Math.floor(c.j / 6) * 5.7), zd = c.zd + (hash2(c.i, c.j) - .5) * .08, hh = hash2(c.i * 2.3, c.j * 1.7);
    const station = Math.abs(c.x - RAIL_I * S) < 14 && zd < .42;
    let set;
    if (block < .07 && zd < .7) set = 'park';
    else if (c.x > 30 && c.z > -40 && zd > .35 && zd < .8) set = 'industry';
    else if (zd < .2 || station) set = hh < .55 ? 'block' : hh < .75 ? 'ryokan' : 'machiya';
    else if (zd < .66) set = hh < .2 ? 'ryokan' : hh < .27 ? 'block' : 'machiya';
    else set = hh < .2 + sstep(.8, 1, zd) * .5 ? 'yard' : 'house';
    lots.push({ ...c, rot, set });
  }
}
function lotGeo(l, seed) {   // the lot's building(s) in lot space: front toward the street (+z)
  const r = rng(seed);
  if (l.set === 'block') return JP.block(seed, Math.min(16, 4 + r() * 12 * (1 - sstep(.1, .45, l.zd))));
  if (l.set === 'ryokan') return JP.ryokan(seed);
  if (l.set === 'house') return JP.machiya(seed, 2.6, 3.4).translate(0, 0, .4);
  return mergeGeometries([JP.machiya(seed, 2.35).translate(-1.2, 0, 0), JP.machiya(seed + 7, 2.35).translate(1.2, 0, 0)]);
}
const placed = (g, l) => g.clone().rotateY(l.rot).translate(l.x, PLAIN, l.z);
async function buildings() {
  R = rng(33);
  const changing = [], fixed = [], industry = [];
  for (const l of lots) {
    if (l.set === 'park' || l.set === 'yard') continue;
    if (l.set === 'industry') { industry.push(l); continue; }
    l.seed = Math.floor(hash2(l.x * .37, l.z * .91) * 1e6);
    (R() < .07 ? changing : fixed).push(l);
  }
  scene.add(new THREE.Mesh(mergeGeometries(fixed.map(l => placed(lotGeo(l, l.seed), l))), jpMat()));
  // the port keeps Kenney's industrial buildings, flattened to one calm tone each
  const by = {}; for (const l of industry) (by[SETS.industry[Math.floor(hash2(l.x, l.z) * SETS.industry.length)]] ||= []).push(l);
  for (const [name, ls] of Object.entries(by)) {
    const k = await kenney(name), s = Math.min(S * .92 / Math.max(k.w, k.d), S * 1.05), m = new THREE.InstancedMesh(k.geo, paintMat(k.map), ls.length);
    ls.forEach((l, i) => { _o.position.set(l.x, PLAIN, l.z); _o.rotation.set(0, l.rot, 0); _o.scale.setScalar(s); _o.updateMatrix(); m.setMatrixAt(i, _o.matrix); m.setColorAt(i, pk(CALM)); });
    scene.add(m);
  }
  setupChanging(changing);
}
function landmarks() {   // the temple and pagoda on the hill, a path of torii up to it, the castle on its own hill
  const parts = [], put = (g, x, z, rot = 0, s = 1) => parts.push(g.scale(s, s, s).rotateY(rot).translate(x, height(x, z) - .1, z));
  const T = PADS[0], K = PADS[1];
  put(JP.templeHall(), T.x - 6, T.z - 6, .6, 1.4); put(JP.pagoda(), T.x + 9, T.z + 5, .6, 2.1);
  const a = [-74, -104], b = [T.x + 5, T.z + 13], dir = Math.atan2(b[0] - a[0], b[1] - a[1]);
  for (let k = 0; k <= 9; k++) { const u = k / 9; put(JP.torii(.85), a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, dir); }
  put(JP.castle(), K.x, K.z, .5, 1.9);
  put(JP.pagoda(), 40, 108, .3, .8);   // a small pagoda in the southern park
  scene.add(new THREE.Mesh(mergeGeometries(parts), jpMat()));
}

// ---------------- trees ----------------
async function trees() {
  const spots = [];
  R = rng(5);
  for (const l of lots) {
    if (l.set === 'park') for (let k = 0; k < 4; k++) spots.push([l.x + rr(-1.8, 1.8), l.z + rr(-1.8, 1.8), rr(.55, .8), R() < .55]);
    if (l.set === 'yard' || l.set === 'house') for (let k = 0; k < (l.set === 'yard' ? 3 : 1); k++) spots.push([l.x + rr(-2, 2), l.z + rr(-2.2, -1.2), rr(.45, .7), R() < .35]);
  }
  for (const c of cells.values()) if (c.type === 'road' && isAve(c) && c.zd > .2 && c.zd < .66 && mod(c.j, 2) === 1) spots.push([c.x - S * .42, c.z, .45, R() < .5]);
  for (const [px, pz, n] of [[PADS[0].x, PADS[0].z, 26], [PADS[1].x, PADS[1].z, 18]]) for (let k = 0; k < n; k++) { const a = rr(0, TAU), d = rr(13, 24); spots.push([px + Math.cos(a) * d, pz + Math.sin(a) * d, rr(.6, .9), R() < .6]); }
  for (let k = 0; k < 12000 && spots.length < 4800; k++) {
    const x = rr(-430, 70), z = rr(-600, 160), h = height(x, z);
    if (h < 1.5 || h > 48 || zoneD(x, z) < 1.05 || coastX(z) - x < 6 || corridorDist(x, z) < 6) continue;
    if (PADS.some(p => Math.hypot(x - p.x, z - p.z) < p.r + 2)) continue;
    const { d, w } = river(x, z); if (d < w * .5 + 3) continue;
    const e = .3, sl = Math.abs(height(x + e, z) - h) + Math.abs(height(x, z + e) - h);
    if (sl > .45 || fbm(x * .03, z * .03) < .42) continue;
    spots.push([x, z, rr(1, 2.1) * (1 + h / 60), R() < .025]);
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

// ---------------- buildings that come down and go up ----------------
// each changing lot has its own period and two events per period: A comes down and B goes up, later B comes down and A goes up.
// An event: demolish ("deconstruct" floor by floor with a crane, or "implode" into dust) → empty → build → frosted → paint.
const DUR = { decon: 4.5, implode: 2.6, empty: 1.4, hold: 1, fly: .7, paint: 1.8 };
const dyn = [];
const blobGeo = new THREE.IcosahedronGeometry(1, 1);
function setupChanging(list) {
  for (const l of list) {
    const r = rng(Math.floor(hash2(l.x, l.z) * 1e9));
    const objs = [l.seed, l.seed + 101].map(seed => {
      const g = lotGeo(l, seed); g.computeBoundingBox(); const m = new THREE.Mesh(g, jpMat({ glass: true }));
      m.position.set(l.x, PLAIN, l.z); m.rotation.y = l.rot; scene.add(m); m.userData.h = g.boundingBox.max.y; return m;
    });
    const per = 70 + r() * 110, s0 = r() * per;
    const ev = [0, 1].map(i => {
      const h = objs[1 - i].userData.h, build = Math.min(12, 2 + Math.ceil(h / 2.4) * .75);
      return { start: mod(s0 + i * (per / 2 + (r() - .5) * per * .2), per), demo: r() < .4 ? 'implode' : 'decon', build, from: i, to: 1 - i, paint: pk(BRIGHT), seed: r() };
    });
    const hs = objs.map(o => o.userData.h), cr = craneMesh(Math.max(...hs) + 4), side = r() < .5 ? 1 : -1;
    cr.g.position.set(l.x + side * (S * .5 + .2), PLAIN, l.z - S * .5 - .2);
    cr.yaw = Math.atan2(-(l.z - cr.g.position.z), l.x - cr.g.position.x); cr.mesh.rotation.y = cr.yaw; cr.reach = Math.hypot(l.x - cr.g.position.x, l.z - cr.g.position.z);
    scene.add(cr.g);
    const blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ color: '#fff' })); blob.visible = false; scene.add(blob);
    const drops = [...Array(8)].map((_, i) => { const d = new THREE.Mesh(blobGeo, blob.material); d.visible = false; scene.add(d); return { d, v: new THREE.Vector3(Math.cos(i * .8) * 2.2, 2 + hash2(i, 1) * 2, Math.sin(i * .8) * 2.2) }; });
    dyn.push({ l, objs, hs, ev, per, cr, dust: dustRig(), blob, drops });
  }
}
function craneMesh(h) {
  const parts = [], box = (w, hh, d, x, y, z) => parts.push(new THREE.BoxGeometry(w, hh, d).translate(x, y, z).toNonIndexed());
  for (const [ox, oz] of [[-.18, -.18], [.18, -.18], [-.18, .18], [.18, .18]]) box(.07, h, .07, ox, h / 2, oz);
  for (let y = .8; y < h; y += .8) box(.45, .06, .45, 0, y, 0);
  box(9, .22, .3, 3.6, h + .15, 0); box(3, .25, .35, -1.6, h + .15, 0); box(.9, .7, .7, -2.6, h - .1, 0); box(.6, .55, .5, 0, h - .2, 0); box(.12, 1.6, .12, 0, h + 1, 0);
  const g = mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); return p; }));
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#fabd2f', emissive: '#fabd2f', emissiveIntensity: .08 }));
  const cable = new THREE.Mesh(new THREE.BoxGeometry(.05, 1, .05).translate(0, -.5, 0), new THREE.MeshLambertMaterial({ color: '#3c3836' }));
  const load = new THREE.Mesh(new THREE.BoxGeometry(2.4, .35, 2.4), new THREE.MeshLambertMaterial({ color: '#ebdbb2' }));
  const g2 = new THREE.Group(); g2.add(mesh, cable, load);
  return { g: g2, mesh, cable, load, h };
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
const steps = h => Math.max(2, Math.min(12, Math.round(h / 2.4)));
function stepped(k, h) { const n = steps(h), x = clamp01(k) * n, f = Math.floor(x); return Math.min(1, (f + smooth((x - f - .55) / .35)) / n); }
const hookPhase = (k, h) => { const x = clamp01(k) * steps(h); return x - Math.floor(x); };
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
    let craneOn = 0, hookY = null, loadOn = false;
    D.blob.visible = false; D.drops.forEach(q => (q.d.visible = false)); D.dust.g.visible = false;
    if (!active || dt >= tBuild) {
      oTo.visible = true; uT.cut.value = 9999; uT.paint.value.copy(e.paint);
      const dir = new THREE.Vector3(cam.x - l.x, 0, cam.z - l.z).normalize();
      uT.hit.value.set(l.x, PLAIN + hTo * (.45 + e.seed * .3), l.z).addScaledVector(dir, S * .45);
      uT.reveal.value = !active ? 99 : dt < tPaint ? 0 : (S + hTo) * 1.3 * ease((dt - tPaint) / DUR.paint);
      const k = (dt - tFly) / DUR.fly, hit = uT.hit.value;
      if (active && k > 0 && k < 1) {
        const from = new THREE.Vector3(hit.x + 18, hit.y + 26, hit.z + 10), p = from.lerp(hit, k); p.y += Math.sin(k * Math.PI) * 6;
        D.blob.visible = true; D.blob.position.copy(p); D.blob.scale.setScalar(.8); D.blob.material.color.copy(e.paint);
      }
      const kd = (dt - tPaint) / .7;
      if (active && kd > 0 && kd < 1) D.drops.forEach(q => { q.d.visible = true; q.d.position.copy(hit).addScaledVector(q.v, kd * 1.4); q.d.position.y -= 5 * kd * kd; q.d.scale.setScalar(.35 * (1 - kd)); });
    } else if (dt < tDemo) {
      const k = dt / DUR[e.demo];
      oFrom.visible = true; uF.reveal.value = 99;
      if (e.demo === 'implode') {
        const sink = easeIn((k - .15) / .85);
        oFrom.position.y = PLAIN - sink * hFrom * 1.02; oFrom.position.x = l.x + Math.sin(dt * 47) * .12 * (1 - sink) * (k > .05 ? 1 : 0);
        uF.cut.value = PLAIN + hFrom * 1.2;
        updateDust(D.dust, l.x, l.z, (k - .1) / 1.1, S * .9);
      } else {
        uF.cut.value = PLAIN + hFrom * (1 - stepped(k, hFrom));
        craneOn = 1; hookY = uF.cut.value + .5; loadOn = hookPhase(k, hFrom) > .5;
      }
    } else if (dt < tEmpty) {
      if (e.demo === 'implode') updateDust(D.dust, l.x, l.z, (dt - DUR.implode * .1) / (DUR.implode * 1.1), S * .9);
      if (hTo > 5) craneOn = 1;
    } else {
      const k = (dt - tEmpty) / e.build;
      oTo.visible = true; uT.reveal.value = 0;
      if (hTo > 5) { const c = stepped(k, hTo); uT.cut.value = PLAIN + hTo * c; craneOn = 1; hookY = PLAIN + hTo * Math.min(1, c + .12) + .5; loadOn = hookPhase(k, hTo) < .55; }
      else uT.cut.value = PLAIN + hTo * ease(k);
    }
    const cIn = sstep(0, 1, dt + .6), cOut = 1 - sstep(tBuild - .2, tBuild + .8, dt);
    const show = active && (craneOn || (dt < tBuild + .8 && Math.max(hFrom, hTo) > 5)) ? Math.min(cIn, cOut) : 0;
    D.cr.g.visible = show > .01; D.cr.g.scale.set(1, Math.max(.01, show), 1);
    const hy = hookY ?? D.cr.h - 2, jibY = D.cr.h + .05, drop = Math.max(.3, jibY - hy);
    const hx = Math.cos(D.cr.yaw) * D.cr.reach, hz = -Math.sin(D.cr.yaw) * D.cr.reach;
    D.cr.cable.position.set(hx, jibY, hz); D.cr.cable.scale.y = drop; D.cr.load.position.set(hx, jibY - drop - .2, hz); D.cr.load.visible = loadOn;
  }
}

// ---------------- traffic ----------------
const cars = [];
function pathOf(pts) { const p = { pts, cum: [0] }; let L = 0; for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]); p.cum.push(L); } p.L = L; return p; }
function along(p, d) {   // position and heading at distance d along a path
  let lo = 1, hi = p.cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (p.cum[m] < d) lo = m + 1; else hi = m; }
  const i = lo, a = p.pts[i - 1], b = p.pts[i], k = clamp01((d - p.cum[i - 1]) / (p.cum[i] - p.cum[i - 1] || 1));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, Math.atan2(b[0] - a[0], b[2] - a[2])];
}
async function traffic() {
  R = rng(91);
  const names = ['cars/sedan', 'cars/taxi', 'cars/delivery', 'cars/suv', 'cars/van', 'cars/hatchback-sports', 'cars/police'];
  const paths = [];
  const lineRuns = (fixed, isNS) => { const out = []; let a = null; const lo = isNS ? J0 : I0, hi = isNS ? J1 : I1;
    for (let v = lo; v <= hi + 1; v++) { const c = isNS ? cellAt(fixed, v) : cellAt(v, fixed), ok = roadish(c); if (ok && a === null) a = v; if (!ok && a !== null) { if (v - a > 2) out.push([a, v - 1]); a = null; } } return out; };
  for (let i = I0; i <= I1; i++) if (mod(i, 3) === 0) for (const [a, b] of lineRuns(i, true)) {
    const pts = []; for (let j = a; j <= b; j++) pts.push([i * S, PLAIN + (cellAt(i, j).type === 'bridge' ? .9 : 0), j * S]);
    paths.push(pathOf(pts));
  }
  for (let j = J0; j <= J1; j++) if (mod(j, 6) === 0) for (const [a, b] of lineRuns(j, false)) paths.push(pathOf([[a * S, PLAIN, j * S], [b * S, PLAIN, j * S]]));
  for (const h of HWAYS) { const p = pathOf(h); p.hw = true; paths.push(p); }
  const slots = [];
  for (const p of paths) { const n = Math.floor(p.L / (p.hw ? 40 : 16)); for (let i = 0; i < n; i++) slots.push({ p, o: R(), speed: (p.hw ? 14 : 7) * rr(.8, 1.2), dir: R() < .5 ? 1 : -1, name: pk(names), tint: pk(PASTEL) }); }
  const by = {}; slots.forEach(s => (by[s.name] ||= []).push(s));
  for (const [name, ss] of Object.entries(by)) {
    const k = await kenney(name), s = 1.9 / Math.max(k.w, k.d), m = new THREE.InstancedMesh(k.geo, paintMat(k.map), ss.length);
    ss.forEach((q, i) => m.setColorAt(i, q.tint));
    scene.add(m); cars.push({ m, slots: ss, s });
  }
}
function updateTraffic(t) {
  for (const c of cars) {
    c.slots.forEach((q, i) => {
      const p = q.p, k = mod(q.o + q.dir * q.speed * t / p.L, 1), [x, y, z, hd] = along(p, k * p.L), lane = q.dir * (p.hw ? 1.1 : S * .14);
      _o.position.set(x + Math.cos(hd) * lane, y + .03, z - Math.sin(hd) * lane); _o.rotation.set(0, hd + (q.dir < 0 ? Math.PI : 0), 0);
      const fade = sstep(0, .02, k) * (1 - sstep(.98, 1, k)); _o.scale.setScalar(c.s * Math.max(.001, fade));
      _o.updateMatrix(); c.m.setMatrixAt(i, _o.matrix);
    });
    c.m.instanceMatrix.needsUpdate = true;
  }
}

// ---------------- the railway and its train ----------------
const train = { cars: [], per: 64, len: 0 };
async function railway() {
  const pts = RAIL.map(([x, z]) => [x, Math.max(PLAIN, height(x, z)), z]);
  for (const p of pts) if (p[2] > -175 && p[2] < 135) p[1] = PLAIN + (cellAt(RAIL_I, Math.round(p[2] / S))?.type === 'railbridge' ? .9 : 0);   // level through town and on its bridge
  const path = train.path = pathOf(pts);
  const tk = await kenney('train/track'), ts = 2.2, n = Math.floor(path.L / ts), m = new THREE.InstancedMesh(tk.geo, new THREE.MeshLambertMaterial({ map: tk.map }), n);
  for (let i = 0; i < n; i++) { const [x, y, z, hd] = along(path, i * ts + ts / 2); _o.position.set(x, y + .02, z); _o.rotation.set(0, hd, 0); _o.scale.setScalar(ts); _o.updateMatrix(); m.setMatrixAt(i, _o.matrix); }
  scene.add(m);
  const livery = [C('#8ec07c').lerp(C('#fbf1c7'), .25), C('#fbf1c7')];
  for (const [n2, name] of ['train/train-electric-city-a', 'train/train-electric-city-b', 'train/train-electric-city-b', 'train/train-electric-city-b', 'train/train-electric-city-c'].entries()) {
    const k = await kenney(name), car = new THREE.Mesh(k.geo, paintMat(k.map, { tint: livery[n2 % 2] }));
    car.scale.setScalar(ts); car.userData.len = k.d * ts; scene.add(car); train.cars.push(car);
  }
  train.len = train.cars.reduce((a, c) => a + c.userData.len + .3, 0);
}
function updateTrain(t) {   // runs the whole line one way, then back the other way, on its own period
  const p = train.path, cyc = mod(t / train.per, 2), dir = cyc < 1 ? 1 : -1, k = cyc < 1 ? cyc : cyc - 1;
  let d = -train.len + k * (p.L + train.len * 2);
  for (const car of train.cars) {
    const c = d - car.userData.len / 2, s = dir > 0 ? c : p.L - c;
    car.visible = s > 0 && s < p.L;
    if (car.visible) { const [x, y, z, hd] = along(p, s); car.position.set(x, y + .32, z); car.rotation.set(0, hd + (dir > 0 ? 0 : Math.PI), 0); }
    d -= car.userData.len + .3;
  }
}

// ---------------- boats ----------------
const boats = [];
function makeBoats() {
  const hull = mergeGeometries([new THREE.BoxGeometry(1.4, .7, 4.2).translate(0, .2, 0), new THREE.ConeGeometry(.7, 1.6, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).scale(1, .5, 1).translate(0, .25, 2.9), new THREE.BoxGeometry(1, .9, 1.4).translate(0, .95, -.6)].map(g => { g = g.toNonIndexed(); g.deleteAttribute('uv'); return g; }));
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(hull, new THREE.MeshLambertMaterial({ color: i % 2 ? '#fbf1c7' : PASTEL[i % PASTEL.length] }));
    m.scale.setScalar(i < 3 ? 2.2 : 1.2); scene.add(m); boats.push({ m, i, per: 50 + i * 13 });
  }
}
function updateBoats(t) {
  const town = RIVER.filter(([x]) => x > -10);
  for (const b of boats) {
    const k = mod(t / b.per, 1);
    if (b.i < 3) { const a = TAU * (k + b.i / 3); b.m.position.set(190 + Math.cos(a) * 60, .1, -140 + Math.sin(a) * 220); b.m.rotation.y = -a; }
    else if (b.i < 5) {   // river ferries: down to the bay and back
      const kk = mod(k + (b.i - 3) * .5, 1), pp = kk < .5 ? kk * 2 : 2 - kk * 2, s = smooth(pp) * (town.length - 1), f = Math.min(town.length - 2, Math.floor(s)), q = s - f;
      const [ax, az] = town[f], [bx, bz] = town[f + 1];
      b.m.position.set(ax + (bx - ax) * q, .05, az + (bz - az) * q); b.m.rotation.y = Math.atan2(bx - ax, bz - az) + (kk < .5 ? 0 : Math.PI);
    } else { const a = TAU * (k + b.i); b.m.position.set(118 + Math.cos(a) * 18 + (b.i - 5) * 30, .05, 40 + Math.sin(a) * 12); b.m.rotation.y = -a; }
  }
}

// ---------------- camera ----------------
let aspect = 16 / 9;
const CAMS = {   // [position, look-at] for landscape; portrait backs off and widens
  a: [[118, 58, 112], [-12, 0, -30]],    // three-quarter from over the bay
  b: [[104, 26, 138], [8, 6, -40]],      // low along the beach: train, shore and skyline, mountains behind
  c: [[178, 74, 6], [-22, 0, -28]],      // across the bay toward the city and the valley
};
function placeCamera(t) {
  if (Q.has('top')) { const [tx, tz, th] = (Q.get('top') || '-10,-20,330').split(',').map(Number); camera.fov = 50; camera.position.set(tx, th, tz + .01); camera.lookAt(tx, 0, tz); camera.aspect = aspect; camera.updateProjectionMatrix(); return; }
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
  for (const m of LANTERNS) m.color.set('#d9674a').lerp(C('#ffc08a'), sstep(.2, .9, SKY.night));
}

// ---------------- go ----------------
function size() { const w = innerWidth, h = innerHeight; aspect = w / h; renderer.setSize(w, h, false); }
addEventListener('resize', size); size();
terrain();
for (const h of [HWY_N, HWY_S, HWY_V]) highway(h);
planLots();
await streets(); await buildings(); landmarks(); await trees(); makeClouds(); makeBoats(); await railway(); await traffic();
function frame(t) {
  U.phase.value = TAU * mod(t, 60) / 60;
  updateSky(t); placeCamera(t); updateChanging(t); updateTraffic(t); updateTrain(t); updateClouds(t); updateBoats(t);
  renderer.render(scene, camera);
}
window.__frame = frame;
window.__info = () => ({ cells: cells.size, lots: lots.length, changing: dyn.length, calls: renderer.info.render.calls, tris: renderer.info.render.triangles });
if (!CAPTURE) { const t0 = performance.now(); renderer.setAnimationLoop(() => frame((performance.now() - t0) / 1000)); }
else frame(Number(Q.get('t') || 0));
window.__ready = true;
