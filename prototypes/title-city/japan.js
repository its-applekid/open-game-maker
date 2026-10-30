// Procedural low-poly Japanese buildings and props for the title city, flat-shaded with one flat colour per surface.
// Each builder returns a non-indexed BufferGeometry with position, normal, color and emit (1 where paper windows, lanterns
// and signs glow at night). Local frame: the base sits at y = 0, centred, and the front faces +z (the street).
import * as THREE from 'three';

export const COL = {
  plaster: ['#f4e9d4', '#efe0c6', '#f6efe2', '#ead8c0'], wood: ['#a07a62', '#8f6c58', '#b08a6e', '#7d6052'], dark: '#5e4a44',
  roof: ['#5d6180', '#6a6888', '#55607a', '#6f6a80'], stone: '#b8afa8', stoneDark: '#9d948f', vermilion: '#e0705a',
  noren: ['#5b6a9a', '#c9604f', '#7f6a9a', '#4f7a78'], paper: '#f3e2bd', lantern: '#ec7a4f', glass: '#9fb2c8', sign: ['#f19ab4', '#8fd3c8', '#f5c46b', '#a7b4f0'],
};

class G {
  constructor() { this.p = []; this.c = []; this.e = []; }
  tri(a, b, c, col, em = 0) {
    this.p.push(...a, ...b, ...c); const k = new THREE.Color(col);
    for (let i = 0; i < 3; i++) { this.c.push(k.r, k.g, k.b); this.e.push(em); }
  }
  quad(a, b, c, d, col, em) { this.tri(a, b, c, col, em); this.tri(a, c, d, col, em); }
  box(x, y, z, w, h, d, col, em = 0, top = true) {   // y is the bottom
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y, y1 = y + h, z0 = z - d / 2, z1 = z + d / 2;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col, em);   // front
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col, em);   // back
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col, em);   // right
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col, em);   // left
    if (top) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], col, em);
  }
  gable(x, y, z, w, d, rise, col, ridgeAlongX = true) {   // a gable roof over w x d, eaves at y
    if (ridgeAlongX) {
      const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, yt = y + rise;
      this.quad([x0, y, z1], [x1, y, z1], [x1, yt, z], [x0, yt, z], col);
      this.quad([x1, y, z0], [x0, y, z0], [x0, yt, z], [x1, yt, z], col);
      this.tri([x1, y, z1], [x1, y, z0], [x1, yt, z], COL.plaster[0]); this.tri([x0, y, z0], [x0, y, z1], [x0, yt, z], COL.plaster[0]);
      this.box(x, yt - .06, z, w + .05, .14, .18, COL.dark);   // ridge cap
    } else {
      const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, yt = y + rise;
      this.quad([x1, y, z1], [x1, y, z0], [x, yt, z0], [x, yt, z1], col);
      this.quad([x0, y, z0], [x0, y, z1], [x, yt, z1], [x, yt, z0], col);
      this.tri([x0, y, z1], [x1, y, z1], [x, yt, z1], COL.plaster[0]); this.tri([x1, y, z0], [x0, y, z0], [x, yt, z0], COL.plaster[0]);
      this.box(x, yt - .06, z, .18, .14, d + .05, COL.dark);
    }
  }
  hip(x, y, z, w, d, rise, ridge, col, flare = 0) {   // a hip roof; flare lifts the four eave corners (temple and pagoda roofs)
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, yt = y + rise, r = Math.min(ridge, w * .9) / 2;
    const c = (px, pz) => [px, y + flare, pz], A = c(x0, z1), B = c(x1, z1), Cc = c(x1, z0), D = c(x0, z0);
    const m = (px, pz) => [px, y + flare * .15, pz], fm = m(x, z1), bm = m(x, z0), rm = m(x1, z), lm = m(x0, z);
    const R1 = [x + r, yt, z], R0 = [x - r, yt, z];
    this.quad(A, fm, R1, R0, col); this.tri(fm, B, R1, col);      // front
    this.quad(Cc, bm, R0, R1, col); this.tri(bm, D, R0, col);     // back
    this.quad(B, rm, R1, R1, col); this.tri(rm, Cc, R1, col);     // right
    this.quad(D, lm, R0, R0, col); this.tri(lm, A, R0, col);      // left
    this.box(x, yt - .06, z, r * 2 + .1, .14, .2, COL.dark);
  }
  cyl(x, y, z, r, h, col, seg = 8, em = 0) {
    for (let i = 0; i < seg; i++) {
      const a = i / seg * Math.PI * 2, b = (i + 1) / seg * Math.PI * 2, ax = x + Math.cos(a) * r, az = z + Math.sin(a) * r, bx = x + Math.cos(b) * r, bz = z + Math.sin(b) * r;
      this.quad([ax, y, az], [ax, y + h, az], [bx, y + h, bz], [bx, y, bz], col, em); this.tri([x, y + h, z], [bx, y + h, bz], [ax, y + h, az], col, em);
    }
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('emit', new THREE.Float32BufferAttribute(this.e, 1)); g.computeVertexNormals(); g.computeBoundingBox(); return g;
  }
}
const rngOf = seed => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const pick = (r, a) => a[Math.floor(r() * a.length)];

// a machiya townhouse, narrow and deep: wood-slat ground floor, plaster upper floor, lattice window, small front eave, tiled roof
export function machiya(seed, w = 2.3, d = 4.2) {
  const r = rngOf(seed), g = new G(), floors = r() < .2 ? 1 : r() < .9 ? 2 : 3, fh = 1.55;
  const wood = pick(r, COL.wood), plaster = pick(r, COL.plaster), roof = pick(r, COL.roof), fz = d / 2;
  g.box(0, 0, 0, w, fh, d, wood);
  for (let i = 0; i < 7; i++) g.box(-w / 2 + .2 + i * (w - .4) / 6, .1, fz + .02, .05, fh - .25, .04, COL.dark);   // slats
  g.box(r() < .5 ? -w * .22 : w * .22, .55, fz + .05, .7, .75, .03, pick(r, COL.noren));                         // noren curtain
  g.box(0, fh - .02, fz + .05, w + .1, .06, .55, COL.dark);
  // small front eave over the shop
  g.quad([-w / 2 - .05, fh + .05, fz + .6], [w / 2 + .05, fh + .05, fz + .6], [w / 2 + .05, fh + .45, fz], [-w / 2 - .05, fh + .45, fz], roof);
  let y = fh;
  for (let f = 1; f < floors; f++) {
    g.box(0, y, -.1, w - .1, fh, d - .2, f === 1 ? plaster : pick(r, COL.plaster));
    g.box(0, y + .35, fz - .08, w * .6, .8, .05, COL.paper, 1);                                                   // paper window
    for (let i = 0; i < 6; i++) g.box(-w * .3 + i * w * .6 / 5, y + .35, fz - .04, .04, .8, .03, COL.dark);         // lattice
    y += fh;
  }
  g.gable(0, y, 0, w + .5, d + .5, r() < .5 ? .85 : 1.05, roof, true);
  if (r() < .6) { g.box(w * .36, 1.05, fz + .35, .03, .25, .03, COL.dark); g.cyl(w * .36, .72, fz + .35, .12, .32, COL.lantern, 6, 1); }   // door lantern
  return g.geo();
}
// a larger shop or ryokan across a whole lot: flared hip roofs, a balcony, rows of windows
export function ryokan(seed, w = 4.3, d = 4.2) {
  const r = rngOf(seed), g = new G(), floors = 2 + (r() < .35 ? 1 : 0), fh = 1.6, wood = pick(r, COL.wood), plaster = pick(r, COL.plaster), roof = pick(r, COL.roof);
  g.box(0, 0, 0, w, fh, d, wood);
  for (let i = 0; i < 4; i++) g.box(-w * .36 + i * w * .24, .5, d / 2 + .04, .7, .7, .03, i % 2 ? COL.paper : pick(r, COL.noren), i % 2);
  g.hip(0, fh + .05, .2, w + .7, d + .9, .45, w * .8, roof, .12);
  let y = fh + .25;
  for (let f = 1; f < floors; f++) {
    g.box(0, y, 0, w - .3, fh, d - .3, plaster);
    for (let i = 0; i < 3; i++) g.box(-w * .3 + i * w * .3, y + .4, d / 2 - .12, .8, .75, .05, COL.paper, 1);
    if (f === 1) { g.box(0, y + .05, d / 2, w - .2, .08, .5, COL.dark); g.box(0, y + .45, d / 2 + .22, w - .2, .06, .06, COL.dark); }   // balcony
    y += fh;
  }
  g.hip(0, y, 0, w + .7, d + .7, 1.1, w * .5, roof, .22);
  if (r() < .5) g.box(w / 2 + .05, fh + .3, d / 2 - .3, .1, 1.8, .55, pick(r, COL.sign), 1);   // hanging sign
  return g.geo();
}
// a modern block near the station: plaster or tile walls, balcony strips, AC units, a vertical neon sign
export function block(seed, h, w = 4.2, d = 4.2) {
  const r = rngOf(seed), g = new G(), fh = 1.25, floors = Math.max(3, Math.round(h / fh)), wall = pick(r, ['#e6d5c0', '#d9c6b6', '#cfd2cc', '#e2cbb8', '#d6cfc0', '#c9c3be']);
  g.box(0, 0, 0, w, floors * fh, d, wall);
  g.box(0, 0, d / 2 + .02, w * .9, fh * .8, .03, COL.glass, 1);
  for (let f = 1; f < floors; f++) {
    const y = f * fh;
    g.box(0, y + .3, d / 2 + .02, w * .82, .55, .03, COL.glass, .6);
    g.box(0, y + .3, -d / 2 - .02, w * .82, .55, .03, COL.glass, .6);
    g.box(w / 2 + .02, y + .3, 0, .03, .55, d * .8, COL.glass, .6); g.box(-w / 2 - .02, y + .3, 0, .03, .55, d * .8, COL.glass, .6);
    g.box(0, y, d / 2 + .2, w * .9, .08, .4, '#c9bfb4'); g.box(0, y + .08, d / 2 + .38, w * .9, .3, .04, '#d9d0c4');
    if (r() < .35) g.box(w * (r() - .5) * .7, y + .1, d / 2 + .25, .35, .25, .25, '#b8b2aa');
  }
  if (r() < .8) g.box(w / 2 + .1, fh * 1.2, d / 2 - .25, .12, Math.min(floors * fh * .6, 6), .7, pick(r, COL.sign), 1);   // vertical sign
  if (r() < .5) g.box(0, floors * fh, 0, w * .6, .9, .1, pick(r, COL.sign), 1);                                           // rooftop billboard
  g.box(0, floors * fh, 0, w + .1, .15, d + .1, '#cfc6bb');
  return g.geo();
}
// a five-storey pagoda on a stone base
export function pagoda(seed = 1) {
  const g = new G(); g.box(0, 0, 0, 5.2, .7, 5.2, COL.stone); let y = .7, s = 3.6;
  for (let i = 0; i < 5; i++) {
    const h = 1.4 - i * .08; g.box(0, y, 0, s, h, s, i % 2 ? COL.vermilion : COL.wood[1]);
    g.box(0, y + h * .35, s / 2 + .01, s * .4, h * .45, .03, COL.paper, 1);
    g.hip(0, y + h, 0, s + 1.6, s + 1.6, .55, .3, COL.roof[0], .35);
    y += h + .5; s *= .86;
  }
  g.cyl(0, y, 0, .07, 3.2, COL.dark, 6); for (let k = 0; k < 6; k++) g.cyl(0, y + .6 + k * .38, 0, .22, .08, '#c8a55a', 8);
  return g.geo();
}
export function templeHall() {
  const g = new G(); g.box(0, 0, 0, 12, .8, 9, COL.stone); g.box(0, .8, 0, 9.5, 3, 6.5, COL.wood[0]);
  for (let i = 0; i < 6; i++) g.box(-4.2 + i * 1.68, .8, 3.3, .3, 3, .3, COL.vermilion);
  for (let i = 0; i < 4; i++) g.box(-3 + i * 2, 1.4, 3.27, 1.4, 1.6, .04, COL.paper, 1);
  g.hip(0, 3.8, 0, 12.5, 9.5, 3.4, 6, COL.roof[0], .6);
  return g.geo();
}
export function torii(s = 1) {
  const g = new G(), v = COL.vermilion;
  g.cyl(-1.5 * s, 0, 0, .16 * s, 3.4 * s, v, 8); g.cyl(1.5 * s, 0, 0, .16 * s, 3.4 * s, v, 8);
  g.box(0, 2.7 * s, 0, 3.6 * s, .2 * s, .25 * s, v); g.box(0, 3.35 * s, 0, 4.3 * s, .25 * s, .4 * s, COL.dark);
  g.quad([-2.3 * s, 3.45 * s, .2 * s], [2.3 * s, 3.45 * s, .2 * s], [2.15 * s, 3.65 * s, 0], [-2.15 * s, 3.65 * s, 0], COL.dark);
  return g.geo();
}
// a castle keep: sloped stone base, three white tiers under dark flared roofs
export function castle() {
  const g = new G();
  const base = 9, top = 7.4, bh = 3;   // sloped stone base as a frustum
  const q = (a, b, c, d) => g.quad(a, b, c, d, COL.stoneDark);
  q([-base / 2, 0, base / 2], [base / 2, 0, base / 2], [top / 2, bh, top / 2], [-top / 2, bh, top / 2]);
  q([base / 2, 0, -base / 2], [-base / 2, 0, -base / 2], [-top / 2, bh, -top / 2], [top / 2, bh, -top / 2]);
  q([base / 2, 0, base / 2], [base / 2, 0, -base / 2], [top / 2, bh, -top / 2], [top / 2, bh, top / 2]);
  q([-base / 2, 0, -base / 2], [-base / 2, 0, base / 2], [-top / 2, bh, top / 2], [-top / 2, bh, -top / 2]);
  let y = bh, s = 6.6;
  for (let i = 0; i < 3; i++) {
    const h = 2.1; g.box(0, y, 0, s, h, s * .8, '#f6f1ea');
    for (let k = 0; k < 3; k++) g.box(-s * .3 + k * s * .3, y + .7, s * .4 + .01, .5, .6, .03, COL.dark);
    g.hip(0, y + h, 0, s + 1.6, s * .8 + 1.6, .9, s * .4, COL.roof[2], .4);
    if (i < 2) g.gable(0, y + h + .2, s * .4 + .4, s * .4, .8, .7, COL.roof[2], true);
    y += h + .7; s *= .74;
  }
  g.box(0, y - .2, 0, s * 1.5, .2, .3, '#c8a55a');
  return g.geo();
}
export function pole(h = 6) {   // a wooden power pole with a cross arm
  const g = new G(); g.cyl(0, 0, 0, .09, h, '#8c7b70', 6); g.box(0, h - .5, 0, 1.4, .1, .1, '#6b5d55'); g.box(0, h - .9, 0, 1, .08, .08, '#6b5d55');
  g.cyl(.3, h - 1.6, .12, .14, .45, '#9a948e', 6);
  return g.geo();
}
export function vending() { const g = new G(); g.box(0, 0, 0, .8, 1.7, .6, pick(rngOf(Math.random() * 1e9), ['#f4f1ea', '#e0705a', '#83a5c8'])); g.box(0, .7, .31, .65, .8, .02, '#f7efd8', 1); return g.geo(); }
