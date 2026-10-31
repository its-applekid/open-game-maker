// The EarthBound homage: a pixel saucer (tools/ufo_sprite.py, after Kevin's reference) rises over the mountains, glides to
// the market quarter and calls down thin orange lightning, each bolt breaking a real house (fracture and flight from
// rampage.js) and leaving it burning (pixelfx campfire). While it strikes, Ness (LimeZu generator variant,
// tools/ness_sprite.py) sprints out of a portal into a wall and stands burnt black, then fights it: PK Fire, PSI plasma, a
// bolt back that burns him again, PK Starstorm that brings the saucer down on the river bank, and a bat swing that flips it
// into the river to drift out to sea and sink. He leaves at a run that speeds up, turns back once and ends in a portal.
// Every sprite and effect is a camera-facing billboard with nearest filtering; pixelfx effects are re-simulated from their
// start for any moment, so capture mode draws any time exactly. ?var=a|b|c: the look (b and c pixelate the whole frame).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FX, reseed } from './fx.js';
import { fracture, flight } from './rampage.js';
import { createFx, createFrame, clearFrame, composite } from './vendor/pixelfx/src/core/index.js';
import * as fireFx from './fx-variants/burning.js';   // campfire without the logs
import * as blastFx from './vendor/pixelfx/src/fx/explosions/dirt-explosion.js';
import * as portalFx from './vendor/pixelfx/src/fx/arcane/portal.js';
import * as starFx from './vendor/pixelfx/src/fx/arcane/star-fall.js';
import * as fireballFx from './vendor/pixelfx/src/fx/fire/fireball.js';
import * as torchFx from './vendor/pixelfx/src/fx/fire/torch.js';
import * as plasmaShotFx from './vendor/pixelfx/src/fx/projectiles/plasma-shot.js';
import * as plasmaBoomFx from './vendor/pixelfx/src/fx/explosions/plasma-explosion.js';
import * as fireBoomFx from './vendor/pixelfx/src/fx/explosions/small-explosion.js';
import * as smokeFx from './vendor/pixelfx/src/fx/explosions/smoke-bomb.js';
import * as powFx from './vendor/pixelfx/src/fx/explosions/cartoon-pow.js';
import * as bluntFx from './vendor/pixelfx/src/fx/impacts/blunt-hit.js';
import * as critFx from './vendor/pixelfx/src/fx/impacts/crit-hit.js';
import * as flashFx from './vendor/pixelfx/src/fx/impacts/hit-flash.js';
import * as landFx from './vendor/pixelfx/src/fx/impacts/heavy-landing.js';
import * as splashFx from './vendor/pixelfx/src/fx/water/splash.js';
import * as ripplesFx from './vendor/pixelfx/src/fx/water/ripples.js';

export const PER = 105;   // 45 s of story, then a minute of rebuilding
const clamp01 = x => Math.min(1, Math.max(0, x)), smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
let seed = 5; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296), rr = (a, b) => a + rnd() * (b - a);
const hashN = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
export const LOOKS = { a: 0, b: 224, c: 160 };   // lines the frame is rendered at: full, SNES, GBA

// ---------------- pixel billboards ----------------
// upright planes that turn to face the camera; `lit` sprites take the day/night light, effects glow as drawn
const SPR_V = `varying vec2 vUv; varying vec3 vW; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SPR_F = `uniform sampler2D map; uniform vec2 off, rep; uniform float lit, alpha, clipY, clipLo; uniform vec3 amb, sunC, fogC; uniform float fogN, fogF; varying vec2 vUv; varying vec3 vW;
void main() { if (vW.y > clipY || vW.y < clipLo) discard;   // clipY cuts above (the bolt), clipLo below (under water)
  vec4 t = texture2D(map, off + vUv * rep); if (t.a < .5 && lit > .5) discard;
  float lum = max(t.r, max(t.g, t.b)); if (lit < .5 && t.a < .55 && lum < .45) discard;   // pixelfx's darkening haze would read as a smudge in 3D
  if (t.a < (lit > .5 ? .04 : .22)) discard;   // and the faintest glow, which reads as a tinted box
  vec3 c = lit > .5 ? t.rgb * min(vec3(1.25), amb * 1.1 + sunC * .55) : t.rgb;
  float f = smoothstep(fogN, fogF, length(vW - cameraPosition)) * (lit > .5 ? 1. : .4);
  float a = lit > .5 ? t.a : smoothstep(.3, .75, t.a);   // glow fades out before it can read as a tinted box
  gl_FragColor = vec4(mix(c, fogC, f), a * alpha);
  #include <colorspace_fragment>
}`;
function billboard(scene, U, tex, w, h, px, ox, oy, lit) {   // w x h pixels, px metres per pixel, (ox, oy) the pixel that sits on the anchor
  const geo = new THREE.PlaneGeometry(w * px, h * px).translate((w / 2 - ox) * px, (oy - h / 2) * px, 0);
  const mat = new THREE.ShaderMaterial({ vertexShader: SPR_V, fragmentShader: SPR_F, transparent: true, depthWrite: !!lit,
    uniforms: { map: { value: tex }, off: { value: new THREE.Vector2(0, 0) }, rep: { value: new THREE.Vector2(1, 1) }, lit: { value: lit ? 1 : 0 }, alpha: { value: 1 }, clipY: { value: 1e9 }, clipLo: { value: -1e9 },
      amb: U.amb, sunC: U.sunC, fogC: U.fogC, fogN: U.fogN, fogF: U.fogF } });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = lit ? 3 : 6; scene.add(m); return m;
}
const nearest = t => { t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return t; };
// a sheet of equal cells; show(col, row) picks one
function sheetSprite(scene, U, tex, cw, ch, px, ox, oy) {
  const m = billboard(scene, U, tex, cw, ch, px, ox, oy, true), W = tex.image.width, H = tex.image.height;
  m.material.uniforms.rep.value.set(cw / W, ch / H);
  m.show = (c, r) => m.material.uniforms.off.value.set(c * cw / W, 1 - (r + 1) * ch / H);
  return m;
}
// a pixelfx effect playing from t0 at an anchor; drawn by re-simulating up to the asked time (cached while time runs forward)
function pxEffect(scene, U, mod, t0, at, px, o = {}) {
  const m = mod.meta, [w, h] = m.size, [ox, oy] = m.origin, D = m.duration;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'), img = g.createImageData(w, h);
  const tex = nearest(new THREE.CanvasTexture(cv)), mesh = billboard(scene, U, tex, w, h, px, ox, oy, false);
  mesh.position.set(...at); mesh.visible = false;
  const frame = createFrame(w, h, -ox, -oy), e = { mesh, t0, end: o.until ?? t0 + D + .2, fx: null, at: -1 };
  e.update = lt => {
    const a = lt - t0; mesh.visible = a >= 0 && lt < e.end; if (!mesh.visible) return;
    if (!e.fx || a < e.at) { e.fx = createFx(mod, { x: 0, y: 0, seed: o.seed ?? 1, ...o.opts }); e.at = 0; }
    while (e.at + 1 / 60 <= a) { e.fx.update(1 / 60); e.at += 1 / 60; }
    clearFrame(frame); e.fx.draw(frame); composite(frame, img.data, null); g.putImageData(img, 0, 0); tex.needsUpdate = true;
    mesh.material.uniforms.alpha.value = (o.until ? clamp01((e.end - lt) / (o.fadeOut ?? .8)) : 1) * (o.fadeIn ? clamp01(a / o.fadeIn) : 1);
    if (o.path) mesh.position.set(...o.path(lt));
  };
  e.aim = o.aim;   // [from, to] in world space: the effect is rolled on screen to point from one to the other
  e.fadeOutOnly = !!o.until;
  return e;
}

// a thin jagged pixel bolt like the reference: dark-red edge, orange body, pale core, re-jagged 14 times a second, flickering.
// It always runs from the saucer's pod (its anchor) down to bottom(lt): update() in earthbound() stretches and rolls it.
function pxBolt(scene, U, t0, t1, bottom, px, sd) {
  const w = 40, h = 160, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), tex = nearest(new THREE.CanvasTexture(cv)), mesh = billboard(scene, U, tex, w, h, px, w / 2, h, false);
  mesh.visible = false; let drawn = -1;
  const update = lt => {
    const on = lt >= t0 && lt < t1 && (Math.floor(lt * 20) % 5 !== 3); mesh.visible = on; if (!on) return;
    mesh.position.set(...bottom(lt));
    const k = Math.floor(lt * 14); if (k === drawn) return; drawn = k;
    let s = (sd * 7919 + k * 104729) >>> 0; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    g.clearRect(0, 0, w, h);
    const path = (x0, y0, y1, spread) => { const pts = [[x0, y0]]; let x = x0, y = y0; while (y < y1) { y = Math.min(y1, y + 4 + Math.floor(r() * 7)); x = Math.max(3, Math.min(w - 4, x + Math.round((r() - .5) * spread))); pts.push([x, y]); } return pts; };
    const line = (pts, col, wd) => { g.fillStyle = col; for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(Math.abs(bx - ax), by - ay);
      for (let j = 0; j <= n; j++) g.fillRect(Math.round(ax + (bx - ax) * j / n) - (wd >> 1), Math.round(ay + (by - ay) * j / n), wd, 1); } };
    const main = path(w / 2, 0, h - 1, 9); main[main.length - 1][0] = w / 2;   // both ends on the centre line: pod and target
    line(main, '#8a1e0a', 4); line(main, '#e8561e', 2); line(main, '#ffd8a8', 1);
    for (let b = 0; b < 2; b++) { const i = 1 + Math.floor(r() * (main.length - 3)), br = path(main[i][0], main[i][1], Math.min(h - 1, main[i][1] + 14 + r() * 20), 12); line(br, '#c23412', 2); line(br, '#ff9a52', 1); }
    tex.needsUpdate = true;
  };
  return { mesh, update, bolt: true, len: h * px };
}

// comic-book word art: a starburst with the word over it, drawn at pixel scale with hard edges; pops in, shakes, fades
function wordArt(scene, U, text, t0, t1, at, px) {
  const w = 200, h = 90, cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
  const star = (r0, r1, n, fill) => { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * Math.PI * 2, r = i % 2 ? r0 : r1 * (.85 + .3 * ((i * 7) % 5) / 5);
    g.lineTo(w / 2 + Math.cos(a) * r * 1.9, h / 2 + Math.sin(a) * r); } g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = 3; g.strokeStyle = '#1a1010'; g.stroke(); };
  star(26, 44, 14, '#ffd23a'); star(18, 30, 12, '#ff7a1a');
  g.save(); g.translate(w / 2, h / 2 + 2); g.rotate(-.08); g.transform(1, 0, -.18, 1, 0, 0);
  let fs = 30; g.font = `900 ${fs}px Impact, "Arial Black", "DejaVu Sans", sans-serif`; const m = g.measureText(text).width; fs = Math.floor(fs * Math.min(1, (w - 16) / m));
  g.font = `900 ${fs}px Impact, "Arial Black", "DejaVu Sans", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 6; g.strokeStyle = '#1a1010'; g.strokeText(text, 0, 0); g.lineWidth = 3; g.strokeStyle = '#d0201a'; g.strokeText(text, 0, 0);
  g.fillStyle = '#fff6c8'; g.fillText(text, 0, 0); g.restore();
  const img = g.getImageData(0, 0, w, h), d = img.data;   // hard pixel edges, like the sprites
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0; g.putImageData(img, 0, 0);
  const mesh = billboard(scene, U, nearest(new THREE.CanvasTexture(cv)), w, h, px, w / 2, h / 2, false); mesh.position.set(...at); mesh.visible = false;
  const update = lt => { const a = lt - t0; mesh.visible = a >= 0 && lt < t1; if (!mesh.visible) return;
    const pop = a < .12 ? a / .12 * 1.35 : a < .25 ? lerp(1.35, 1, (a - .12) / .13) : 1; mesh.scale.setScalar(pop);
    mesh.material.uniforms.alpha.value = clamp01((t1 - lt) / .3); };
  return { mesh, update, word: true, shake: lt => Math.sin(lt * 70) * .04 * Math.max(0, 1 - (lt - t0) * 2) - .1 };
}

// ctx: { scene, camera, U, PLAIN, ground(x, z), kenney(path), kitMat(map, o), houses: [{x, z, rot, s, model, roof}], centre: [x, z], mountains: [x, z], square: [x, z], look, ufo }
export async function earthbound(ctx) {
  const { scene, U, PLAIN, ground } = ctx; seed = 5; reseed(13);
  const fx = new FX(scene, ctx.camera, U), load = p => new THREE.TextureLoader().loadAsync(p).then(nearest);
  const [cx, cz] = ctx.centre, toM = [ctx.mountains[0] - cx, ctx.mountains[1] - cz], ml = Math.hypot(...toM), dm = [toM[0] / ml, toM[1] / ml], sd = [dm[1], -dm[0]];
  // ---- the houses of the quarter, each breakable
  const D = [];
  for (const h of ctx.houses) {
    const k = await ctx.kenney(h.model), g = k.geo.clone(); g.scale(h.s, h.s, h.s); g.rotateY(h.rot);
    const mat = ctx.kitMat(k.map, { tint: new THREE.Color(h.roof) }), chunkMat = mat.clone(); chunkMat.side = THREE.DoubleSide;
    chunkMat.uniforms = { ...mat.uniforms, cut: { value: 9999 } };
    const whole = new THREE.Mesh(g, mat); whole.position.set(h.x, PLAIN, h.z); scene.add(whole);
    D.push({ x: h.x, z: h.z, h: k.h * h.s, r: Math.max(k.w, k.d) * h.s * .5, geo: g, mat, chunkMat, versions: [{ t: -1, mesh: whole }], chunks: [] });
  }
  const SHAKES = [];
  function blast(d, t, top, power) {   // everything above a jagged line flies out from the strike point, up and away
    const cur = d.versions[d.versions.length - 1].geoCur || d.geo;
    const { keep, chunks } = fracture(cur, (x, y, z) => y > top + (hashN(Math.round(x * 1.3), Math.round(z * 1.3)) - .5) * 2.6);
    if (!chunks.length) return;
    const mesh = new THREE.Mesh(keep, d.mat); mesh.position.set(d.x, PLAIN, d.z); mesh.visible = false; scene.add(mesh); d.versions.push({ t, mesh, geoCur: keep });
    for (const c of chunks) {
      if (c.tris < 2) continue;
      const sz = Math.min(1.6, c.r * 1.1), core = new THREE.BoxGeometry(sz, sz * .8, sz).toNonIndexed(), uv = c.geo.attributes.uv;
      if (uv) { const a = new Float32Array(core.attributes.position.count * 2); for (let i = 0; i < a.length; i += 2) { a[i] = uv.getX(0); a[i + 1] = uv.getY(0); } core.setAttribute('uv', new THREE.BufferAttribute(a, 2)); }
      const m = new THREE.Mesh(uv ? mergeGeometries([c.geo, core]) : c.geo, d.chunkMat); m.visible = false; scene.add(m);
      const p = [d.x + c.c[0], PLAIN + c.c[1], d.z + c.c[2]], out = [c.c[0], c.c[2]], ol = Math.hypot(...out) || 1, sp = rr(4, 10) * power;
      d.chunks.push({ m, t0: t, r: c.r, frames: flight(p, [out[0] / ol * sp + rr(-2, 2), rr(5, 12) * power, out[1] / ol * sp + rr(-2, 2)], [rr(-1, 1), rr(-1, 1), rr(-1, 1)].map(x => x * rr(2, 9)), c.r, ground, fx, t) });
    }
    fx.debris(t, [d.x, PLAIN + top + 1, d.z], [0, 0], .5 + power * .3);   // grit only: the dust and fire are pixelfx
    SHAKES.push({ t, a: .35 * power });
  }
  // ---- the saucer: over the ridge, across the sky, hovering and drifting over each target as it strikes
  const ufoTex = await load(`models/sprites/ufo/ufo_${ctx.ufo || 'a'}.png`), ufo = sheetSprite(scene, U, ufoTex, 112, 32, .17, 56, 28);   // anchored at the pod's tip
  const ridgeAt = [cx + dm[0] * 230, cz + dm[1] * 230], ridgeY = ground(...ridgeAt);
  const HOVER = 24, STRIKE0 = 7.4, GAP = 1.3;
  // the fight's places, laid out for the main camera; the saucer's first crash is on dry ground, well up from the river
  const camDir = [-dm[0] * 56 + sd[0] * 24, -dm[1] * 56 + sd[1] * 24], cl = Math.hypot(...camDir), fwd = [-camDir[0] / cl, -camDir[1] / cl], rgt = [-fwd[1], fwd[0]];
  const F = [12, 4], UH = [F[0] + rgt[0] * 12 + fwd[0] * 6, PLAIN + 15, F[1] + rgt[1] * 12 + fwd[1] * 6];
  let ri = 0; ctx.river.forEach((p, i) => { if (Math.hypot(p[0] - UH[0], p[1] - UH[2]) < Math.hypot(ctx.river[ri][0] - UH[0], ctx.river[ri][1] - UH[2])) ri = i; });
  const R0 = ctx.river[ri], rn = [ctx.river[ri + 1][1] - ctx.river[ri - 1][1], -(ctx.river[ri + 1][0] - ctx.river[ri - 1][0])], rl = Math.hypot(...rn);
  const bankSide = Math.sign((F[0] - R0[0]) * rn[0] + (F[1] - R0[1]) * rn[1]) || 1;
  const C = [R0[0] + rn[0] / rl * bankSide * (R0[2] * .5 + 9), R0[1] + rn[1] / rl * bankSide * (R0[2] * .5 + 9)];   // crash site, up the bank
  const B = [C[0] - rgt[0] * 10.5 - fwd[0] * 1.5, C[1] - rgt[1] * 10.5 - fwd[1] * 1.5];   // where Ness swings, at the saucer's left tip
  // the six it strikes: the tallest, but first any tall house standing between the later shots' camera and the fight
  const segD = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], k = clamp01(((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)); return Math.hypot(p[0] - a[0] - dx * k, p[1] - a[1] - dz * k); };
  const blocks = d => d.h > 7 && [F, B, C].some(q => segD([d.x, d.z], q, [q[0] - fwd[0] * 26, q[1] - fwd[1] * 26]) < d.r + 2.5);
  const targets = [...D.filter(blocks), ...D.filter(d => !blocks(d)).sort((a, b) => b.h - a.h)].slice(0, 6).sort((a, b) => ((a.x - cx) * sd[0] + (a.z - cz) * sd[1]) - ((b.x - cx) * sd[0] + (b.z - cz) * sd[1]));
  const keys = [[0, ridgeAt[0], ridgeY - 14, ridgeAt[1]], [.6, ridgeAt[0], ridgeY - 14, ridgeAt[1]], [3, ridgeAt[0], ridgeY + 20, ridgeAt[1]]];   // rises from behind the ridge
  targets.forEach((d, i) => keys.push([STRIKE0 - .45 + i * GAP, d.x, PLAIN + HOVER, d.z], [STRIKE0 + 1.2 + i * GAP, d.x, PLAIN + HOVER, d.z]));   // holds over each target while the bolt falls
  keys.splice(3, 0, [4.6, lerp(ridgeAt[0], targets[0].x, .5), PLAIN + 85, lerp(ridgeAt[1], targets[0].z, .5)],   // high over the castle hill
    [STRIKE0 - 1.3, lerp(ridgeAt[0], targets[0].x, .92), PLAIN + HOVER + 8, lerp(ridgeAt[1], targets[0].z, .92)]);   // the glide in
  const ufoAt = t => { let i = 0; while (i < keys.length - 2 && keys[i + 1][0] <= t) i++; const a = keys[i], b = keys[i + 1], k = smooth((t - a[0]) / (b[0] - a[0]));
    return [lerp(a[1], b[1], k), lerp(a[2], b[2], k) + Math.sin(t * 2.2) * .8, lerp(a[3], b[3], k)]; };
  // ---- the strikes: a bolt from the saucer's pod onto each target; the house blows apart as the bolt lands, then burns
  const effects = [];
  const burn = (d, t, i, n = 2) => { for (let j = 0; j < n; j++) {   // fires on a ruin, each its own size, height and start, so no two burn alike
    const a = (i * 2 + j) * 2.4, off = j ? d.r * .9 : 0;
    const f = pxEffect(scene, U, fireFx, t + j * .5, [d.x + Math.cos(a) * off, PLAIN + d.h * (j ? .12 : .3), d.z + Math.sin(a) * off], j ? .07 : rr(.085, .115), { seed: 9 + i * 7 + j * 31, opts: { height: j ? rr(12, 18) : rr(18, 30) }, until: PER - .3, fadeOut: 1.5 });
    effects.push(f); (d.fires ||= []).push(f); } };
  targets.forEach((d, i) => {
    const t0 = STRIKE0 + i * GAP, land = t0 + .7;
    effects.push(pxBolt(scene, U, land - .25, land + .75, () => [d.x, PLAIN + d.h * .3, d.z], .12, 3 + i));
    blast(d, land, d.h * rr(.15, .35), 1.2);
    effects.push(pxEffect(scene, U, blastFx, land - .05, [d.x, PLAIN, d.z], .09, { seed: 21 + i }));
    for (const o of D) if (o !== d && Math.hypot(o.x - d.x, o.z - d.z) < 7 && !targets.includes(o)) blast(o, land + .1, o.h * rr(.55, .75), .6);
    burn(d, land + .3, i);
  });
  // ---- timeline (seconds in the loop): the gag, an active fight, the crash, the bat, the exit
  const T = { portal: 10.6, out: 10.75, wall: 11.45, jump: 13.95, land: 14.85,
    bolt1: 15.7, roofRun: 16.3, roofJump: 17.0, onRoof: 17.6, a1: 17.9, bolt2: 19.6, leap: 19.45, down: 20.1, a2miss: 20.4, a2: 21.2,
    bolt3: 22.7, burnt: 22.9, up: 24.7, a3: 25.2, fall: 26.3, crash: 27.7, walk: 28.4, swing: 33.6, run: 35.6, runT: 6, sink: 39.4 };
  T.hit1 = T.a1 + .65; T.hit2 = T.a2 + .65; T.struck = T.bolt3 + .2; T.contact = T.swing + 3 / 8; T.flipEnd = T.contact + 1.2; T.runEnd = T.run + T.runT;
  // ---- Ness: normal, burnt (black, hair up) and the bat swing
  const nessTex = await load('models/sprites/variants/ness.png'), burntTex = await load('models/sprites/variants/ness_burnt.png'), batTex = await load('models/sprites/variants/ness_bat.png');
  const NPX = .1, ness = sheetSprite(scene, U, nessTex, 32, 64, NPX, 16, 62), bat = sheetSprite(scene, U, batTex, 64, 64, NPX, 32, 62);
  // the wall he runs into: a standing house near the square, approached from the open square
  const wallD = D.filter(d => !targets.includes(d) && d.h > 6).sort((a, b) => Math.hypot(a.x - F[0], a.z - F[1]) - Math.hypot(b.x - F[0], b.z - F[1]))[0];
  const wd = [F[0] - wallD.x, F[1] - wallD.z], wl = Math.hypot(...wd), W = [wallD.x + wd[0] / wl * (wallD.r + .7), wallD.z + wd[1] / wl * (wallD.r + .7)], P0 = [wallD.x + wd[0] / wl * (wallD.r + 11), wallD.z + wd[1] / wl * (wallD.r + 11)];   // out of the portal at a full sprint
  const Wk = [W[0] + wd[0] / wl * .8, W[1] + wd[1] / wl * .8];   // knocked back a step
  const gy = (x, z) => Math.max(PLAIN, ground(x, z));
  // the rooftop he fires from: a house still standing near the square; the saucer's second bolt takes its roof off
  const F2 = [F[0] - rgt[0] * 5.5, F[1] - rgt[1] * 5.5];
  const Rh = D.filter(d => d.versions.length === 1 && d.h > 5 && d.h < 14).sort((a, b) => Math.hypot(a.x - F2[0], a.z - F2[1]) - Math.hypot(b.x - F2[0], b.z - F2[1]))[0];
  const unit = (a, b) => { const v = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l]; };
  const ur = unit([Rh.x, Rh.z], F2), roofY = Rh.h * .98, Rb = [Rh.x + ur[0] * (Rh.r + 1.2), Rh.z + ur[1] * (Rh.r + 1.2)];
  const ug = unit([Rh.x, Rh.z], F), G3 = [Rh.x + ug[0] * (Rh.r + 6) + rgt[0] * 2, Rh.z + ug[1] * (Rh.r + 6) + rgt[1] * 2], G4 = [G3[0] + rgt[0] * 3, G3[1] + rgt[1] * 3];
  const P3 = (p, y = 0) => [p[0], y, p[1]], RT = [Rh.x, roofY, Rh.z];
  const FIGHT = [   // [t0, t1, what, from, to, jump height]
    [T.land, 15.45, 'idle', P3(F)], [15.45, 15.85, 'run', P3(F), P3(F2)], [15.85, T.roofRun, 'idle', P3(F2)],   // dodges the first bolt
    [T.roofRun, T.roofJump, 'run', P3(F2), P3(Rb)], [T.roofJump, T.onRoof, 'jump', P3(Rb), RT, 3], [T.onRoof, T.a1, 'idle', RT],
    [T.a1, T.a1 + .9, 'cast', RT], [T.a1 + .9, T.leap, 'idle', RT], [T.leap, T.down, 'jump', RT, P3(G3), 2.5],          // leaps clear of the second
    [T.down, T.a2miss, 'idle', P3(G3)], [T.a2miss, T.a2miss + .7, 'cast', P3(G3)], [T.a2miss + .7, T.a2, 'idle', P3(G3)], [T.a2, T.a2 + .7, 'cast', P3(G3)],
    [T.a2 + .7, T.burnt, 'idle', P3(G3)], [T.burnt, T.up, 'burnt', P3(G3)], [T.up, T.up + .5, 'run', P3(G3), P3(G4)], [T.up + .5, T.a3, 'idle', P3(G4)],
    [T.a3, T.a3 + 1, 'cast', P3(G4)], [T.a3 + 1, T.walk, 'idle', P3(G4)]];
  // the saucer through the fight: over Ness to strike, strafing to keep its distance, swooping over the roof, jinking
  const up = (p, y) => [p[0], gy(p[0], p[1]) + y, p[1]];
  const U1 = up([Rh.x + rgt[0] * 13 + fwd[0] * 2, Rh.z + rgt[1] * 13 + fwd[1] * 2], roofY + 7), U3a = up([G3[0] + rgt[0] * 12 + fwd[0] * 3, G3[1] + rgt[1] * 12 + fwd[1] * 3], 12);
  const U3b = [U3a[0] - fwd[0] * 6 + rgt[0] * 2, U3a[1] + 3, U3a[2] - fwd[1] * 6 + rgt[1] * 2], U5 = up([G4[0] + rgt[0] * 12 + fwd[0] * 4, G4[1] + rgt[1] * 12 + fwd[1] * 4], 15);
  keys.push([15.55, ...up(F, 15)], [16.35, ...up(F, 15)], [17.5, ...U1], [18.5, U1[0] - fwd[0] * 2, U1[1] + 1, U1[2] - fwd[1] * 2],
    [19.5, Rh.x, gy(Rh.x, Rh.z) + roofY + 12, Rh.z], [20.25, Rh.x, gy(Rh.x, Rh.z) + roofY + 12, Rh.z], [20.65, ...U3a], [20.95, ...U3b], [21.95, ...U3b],
    [22.6, ...up(G3, 14)], [23.55, ...up(G3, 14)], [24.6, ...U5], [99, ...U5]);
  const path = pts => { const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { len: L[L.length - 1], at(d) { d = Math.max(0, Math.min(L[L.length - 1], d)); let i = 1; while (i < L.length - 1 && L[i] < d) i++; const k = (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1), a = pts[i - 1], b = pts[i];
      return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), b[0] - a[0], b[1] - a[1]]; } }; };
  const walkP = path([G4, F, B]);   // straight up to it
  // the exit: out of the rubble to the market, east along the harbour road, a U-turn, then flat out west past the square
  const RUN = [B, [16, 8], [14, 14], [25, 17], [40, 20.8], [38, 19.6], [25, 16.4], [14, 14], [-4, 17.1], [-14, 18.9]];
  const runP = path(RUN), acc = 2 * (runP.len - 5 * T.runT) / (T.runT * T.runT), runD = a => 5 * a + .5 * acc * a * a;
  const E = RUN[RUN.length - 1];
  // how high the rubble is under a point: chunks that have landed (centre plus most of their size), so he stands on it
  const rubble = (x, z, lt) => { let top = 0;
    for (const d of D) for (const c of d.chunks) { if (lt < c.t0 + 1.4 || (d.rebuild && lt > d.rebuild - 2)) continue;
      const f = c.frames, n = f.length - 7, dd = Math.hypot(f[n] - x, f[n + 2] - z); if (dd > c.r + .45) continue;
      top = Math.max(top, f[n + 1] + c.r * .55 * (1 - dd / (c.r + .45)) - gy(f[n], f[n + 2])); }
    return Math.min(top, 1.6); };
  // where Ness is and what he's doing at any moment: row (1 idle, 2 run, 13 cast), frame, and the way he faces (the
  // column is picked per camera in update)
  function nessAt(lt) {
    const o = { vis: true, tex: nessTex, row: 1, frame: Math.floor(lt * 6) % 6, dir: null, bat: -1, p: [F[0], 0, F[1]] };
    const toUfo = p => { const u = ufoAt(lt); return [u[0] - p[0], u[2] - p[2]]; };
    if (lt < T.out || lt > T.runEnd) { o.vis = false; return o; }
    if (lt < T.wall) { const k = (lt - T.out) / (T.wall - T.out); o.p = [lerp(P0[0], W[0], k), 0, lerp(P0[1], W[1], k)]; o.dir = [W[0] - P0[0], W[1] - P0[1]]; o.row = 2; o.frame = Math.floor(lt * 22) % 6; }
    else if (lt < T.jump) { const k = smooth((lt - T.wall) / .25); o.p = [lerp(W[0], Wk[0], k), 0, lerp(W[1], Wk[1], k)]; o.tex = burntTex; o.dir = [-fwd[0], -fwd[1]]; }
    else if (lt < T.land) { const k = (lt - T.jump) / (T.land - T.jump); o.p = [lerp(Wk[0], F[0], k), Math.sin(k * Math.PI) * 5, lerp(Wk[1], F[1], k)]; o.dir = [F[0] - Wk[0], F[1] - Wk[1]]; o.row = 2; o.frame = 1; }
    else if (lt < T.walk) {
      const [t0, t1, what, a, b, hj] = FIGHT.find(f => lt < f[1]) || FIGHT[FIGHT.length - 1], k = clamp01((lt - t0) / (t1 - t0));
      if (what === 'run') { o.p = a.map((v, i) => lerp(v, b[i], k)); o.dir = [b[0] - a[0], b[2] - a[2]]; o.row = 2; o.frame = Math.floor(lt * 14) % 6; }
      else if (what === 'jump') { o.p = a.map((v, i) => lerp(v, b[i], k)); o.p[1] += Math.sin(k * Math.PI) * hj; o.dir = [b[0] - a[0], b[2] - a[2]]; o.row = 2; o.frame = 1; }
      else { o.p = [...a]; o.dir = toUfo(a); if (what === 'cast') { o.row = 13; o.frame = 3; } if (what === 'burnt') { o.tex = burntTex; o.dir = [-fwd[0], -fwd[1]]; } }
    }
    else if (lt < T.swing) { const d = Math.min(walkP.len, (lt - T.walk) * walkP.len / (T.swing - .3 - T.walk)), q = walkP.at(d); o.p = [q[0], 0, q[1]];
      if (d < walkP.len) { o.dir = [q[2], q[3]]; o.row = 2; o.frame = Math.floor(d / 1.1) % 6; } else o.dir = [C[0] - B[0], C[1] - B[1]]; }
    else if (lt < T.swing + .75) { o.p = [B[0], 0, B[1]]; o.bat = Math.min(5, Math.floor((lt - T.swing) * 8)); o.dir = [C[0] - B[0], C[1] - B[1]]; }
    else if (lt < T.run) { o.p = [B[0], 0, B[1]]; o.dir = [rgt[0], rgt[1]]; }
    else { const a = lt - T.run, d = runD(a), q = runP.at(d); o.p = [q[0], 0, q[1]]; o.dir = [q[2], q[3]]; o.row = 2; o.frame = Math.floor(d / 1.1) % 6; }
    o.p[1] += gy(o.p[0], o.p[2]) + rubble(o.p[0], o.p[2], lt); return o;
  }
  const at3 = (p, y = 0) => [p[0], gy(p[0], p[1]) + y, p[1]];
  const hull = t => { const u = ufoAt(t); return [u[0], u[1] + 2.5, u[2]]; };   // the hull's middle, above the pod
  // ---- the portal in, the wall, the jump
  effects.push(pxEffect(scene, U, portalFx, T.portal, at3(P0), .06, { seed: 4, until: T.portal + 1.1, fadeIn: .2, fadeOut: .4 }));
  effects.push(pxEffect(scene, U, bluntFx, T.wall - .02, at3(W, 2.6), .05, { seed: 5 }));
  effects.push(pxEffect(scene, U, powFx, T.wall, at3(W, 4.2), .035, { seed: 6 }));
  effects.push(pxEffect(scene, U, landFx, T.land - .05, at3(F), .04, { seed: 7 }));
  // ---- the fight. Bolt 1 misses (he dodges); he fires PK Fire from the roof; bolt 2 takes the roof off as he leaps;
  // PSI plasma misses once as the saucer jinks, then hits; bolt 3 catches him; PK Starstorm brings it down
  const hand = lt => { const n = nessAt(lt).p; return [n[0] + rgt[0] * .6, n[1] + 2.6, n[2] + rgt[1] * .6]; };
  const shot = (mod, t0, t1, to, px, sd, past = 1) => { const a = hand(t0), b = to.map((v, i) => a[i] + (v - a[i]) * past);
    effects.push(pxEffect(scene, U, mod, t0, a, px, { seed: sd, until: t1, fadeOut: past > 1 ? .3 : .05, path: lt => { const k = clamp01((lt - t0) / (t1 - t0)); return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }, aim: [a, b] })); };
  effects.push(pxBolt(scene, U, T.bolt1, T.bolt1 + .6, () => at3(F), .12, 30));
  effects.push(pxEffect(scene, U, blastFx, T.bolt1 + .2, at3(F), .05, { seed: 29 }));
  shot(fireballFx, T.a1 + .1, T.hit1, hull(T.hit1), .05, 11);
  effects.push(pxEffect(scene, U, critFx, T.hit1, hull(T.hit1), .07, { seed: 12 }));
  effects.push(pxEffect(scene, U, fireBoomFx, T.hit1 + .02, [hull(T.hit1)[0], hull(T.hit1)[1] - 2, hull(T.hit1)[2]], .06, { seed: 13 }));   // one big burst of fire
  effects.push(pxBolt(scene, U, T.bolt2, T.bolt2 + .6, () => [Rh.x, PLAIN + roofY, Rh.z], .12, 32));
  blast(Rh, T.bolt2 + .25, Rh.h * .45, 1); effects.push(pxEffect(scene, U, blastFx, T.bolt2 + .2, [Rh.x, PLAIN + Rh.h * .45, Rh.z], .08, { seed: 33 })); burn(Rh, T.bolt2 + .5, 9, 1);
  shot(plasmaShotFx, T.a2miss + .1, T.a2miss + .9, hull(T.a2miss + .45), .05, 15, 1.9);   // the saucer jinks and it flies past
  shot(plasmaShotFx, T.a2 + .1, T.hit2, hull(T.hit2), .05, 16);
  effects.push(pxEffect(scene, U, plasmaBoomFx, T.hit2, hull(T.hit2), .07, { seed: 17 }));
  effects.push(pxBolt(scene, U, T.bolt3, T.bolt3 + .8, () => at3(G3, .2), .12, 31));
  effects.push(pxEffect(scene, U, flashFx, T.struck, at3(G3, 2.2), .06, { seed: 18 }));
  effects.push(pxEffect(scene, U, starFx, T.a3, [U5[0], U5[1] + 1.5, U5[2]], .1, { seed: 19 }));
  effects.push(pxEffect(scene, U, smokeFx, T.fall, at3(C, 1), .07, { seed: 20, until: T.swing + .4 }));
  effects.push(pxEffect(scene, U, blastFx, T.crash - .05, at3(C), .12, { seed: 22 }));
  // ---- the bat: contact, SMAAAAAASH!!!, the flip into the river, the splash
  const tip = (y, k) => at3(B, y).map((v, i) => v + (i === 0 ? rgt[0] * k : i === 2 ? rgt[1] * k : 0));
  effects.push(pxEffect(scene, U, critFx, T.contact, tip(2.4, 1.5), .06, { seed: 23 }));
  effects.push(wordArt(scene, U, 'SMAAAAAASH!!!', T.contact, T.contact + 1.6, tip(8, 4), .11));
  for (let i = -1; i <= 1; i++) effects.push(pxEffect(scene, U, splashFx, T.flipEnd - .08 + Math.abs(i) * .06, [R0[0] + rgt[0] * i * 7, .1, R0[1] + rgt[1] * i * 7], i ? .08 : .12, { seed: 25 + i }));   // a big splash the hull's width
  effects.push(pxEffect(scene, U, ripplesFx, T.flipEnd + .3, [R0[0], .08, R0[1]], .1, { seed: 28, until: T.flipEnd + 3, fadeOut: 1 }));
  SHAKES.push({ t: T.crash, a: .6 }, { t: T.contact, a: .6 }, { t: T.wall, a: .15 }, { t: T.bolt1 + .2, a: .25 });
  // ---- the run out: dust at his feet, fire for the last steps, a portal for a second
  for (let i = 0; i < 26; i++) { const a = i / 26 * T.runT, q = runP.at(runD(a)), late = a > T.runT - 1.1;
    effects.push(pxEffect(scene, U, late ? torchFx : landFx, T.run + a, at3([q[0], q[1]]), late ? .03 : .022, { seed: 40 + i, ...(late ? { until: T.run + a + .7, fadeOut: .4 } : {}) })); }
  effects.push(pxEffect(scene, U, portalFx, T.runEnd - .5, at3(E), .06, { seed: 8, until: T.runEnd + .5, fadeIn: .15, fadeOut: .35 }));
  // ---- the saucer after the fight: falls onto the bank, rests tilted; the bat flips it into the river; it drifts and sinks
  let rd = [0]; for (let i = ri + 1; i < ctx.river.length; i++) rd.push(rd[rd.length - 1] + Math.hypot(ctx.river[i][0] - ctx.river[i - 1][0], ctx.river[i][1] - ctx.river[i - 1][1]));
  const downstream = d => { let i = 1; while (i < rd.length - 1 && rd[i] < d) i++; const k = clamp01((d - rd[i - 1]) / (rd[i] - rd[i - 1])), a = ctx.river[ri + i - 1], b = ctx.river[ri + i]; return [lerp(a[0], b[0], k), lerp(a[1], b[1], k)]; };
  const hits = [T.hit1, T.hit2, T.a3 + 1];
  function ufoState(lt, base) {
    let p = base, rz = 0, clip = -1e9;
    for (const h of hits) { const a = lt - h; if (a >= 0 && a < .5) p = [p[0] + Math.sin(a * 60) * .5 * (1 - a * 2), p[1] + Math.sin(a * 47) * .4, p[2]]; }
    if (lt >= T.fall) { const k = clamp01((lt - T.fall) / (T.crash - T.fall)), s = ufoAt(T.fall), g = at3(C, -.6); p = [lerp(s[0], g[0], k), lerp(s[1], g[1], k * k), lerp(s[2], g[2], k)]; rz = -.28 * k + Math.sin(lt * 9) * .06 * (1 - k); }
    if (lt >= T.contact) { const k = clamp01((lt - T.contact) / (T.flipEnd - T.contact)), g = at3(C, -.6); p = [lerp(g[0], R0[0], k), lerp(g[1], 3.4, k) + Math.sin(k * Math.PI) * 9, lerp(g[2], R0[1], k)]; rz = lerp(-.28, -Math.PI, smooth(k)); }
    if (lt >= T.flipEnd) {   // floats off downstream, then sinks slowly and steadily over five seconds (Kevin)
      const a = lt - T.flipEnd, q = downstream(a * 1.0 * (1 - Math.exp(-a))), sk = clamp01((lt - T.sink) / 5);
      p = [q[0], 3.4 + Math.sin(a * 2.1) * .15 * (1 - sk) - sk * 3.9, q[1]]; rz = -Math.PI + Math.sin(a * 1.3) * .08 + sk * .35; clip = .05; }
    return { p, rz, clip };
  }
  // ---- after the fight: every broken house is rebuilt in scaffolding, one at a time in random order, at uneven gaps,
  // over the next minute; its fire goes out and its rubble sinks just before
  const REB = 9, wrecked = D.filter(d => d.versions.length > 1);
  for (let i = wrecked.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [wrecked[i], wrecked[j]] = [wrecked[j], wrecked[i]]; }
  const gaps = wrecked.map(() => rr(.4, 2.2) ** 2), gsum = gaps.reduce((a, b) => a + b, 0), span = PER - (T.runEnd + 6) - REB - 4;
  let at = T.runEnd + 6; wrecked.forEach((d, i) => { d.rebuild = at; at += gaps[i] / gsum * span;
    for (const f of d.fires || []) f.end = d.rebuild - .5;
    d.sc = ctx.scaffold(d.r * 1.6 + .9, d.r * 1.6 + .9, d.h + .8, ctx.steps(d.h)); d.sc.position.set(d.x, PLAIN, d.z); scene.add(d.sc); ctx.layers(d.sc, 0); });
  // ---- sound: Kenney CC0 effects (tools/sounds.sh), cued on the same timeline. { t, s: name, v: volume, r: rate };
  // loops play between t0 and t1. city.js plays them live; tools/mix_sound.mjs lays them under a recording.
  const SND = [], LOOPS = [], sn = (t, s, v = 1, r = 1) => SND.push({ t: +t.toFixed(3), s, v, r }), pick = (b, n) => `${b}_00${Math.floor(rnd() * n)}`;
  LOOPS.push({ t0: .3, t1: T.crash, s: 'spaceEngineLow_000', v: .1 });                       // the saucer's hum
  targets.forEach((d, i) => { const land = STRIKE0 + i * GAP + .7;
    sn(land - .25, pick('laserLarge', 5), .7, .8); sn(land, 'lowFrequency_explosion_00' + (i % 2), .9); sn(land + .02, pick('explosionCrunch', 5), .8);
    sn(land + .15, pick('impactWood_heavy', 5), .5); });
  sn(T.portal, 'forceField_000', .7);
  { let k = -1; for (let t = T.out; t < T.runEnd; t += .01) { const n = nessAt(t), st = n.row === 2 && n.frame % 3 === 0 ? n.frame : -1;   // a footstep on every stride
    if (st >= 0 && st !== k && !(t > T.jump && t < T.land)) sn(t, pick('footstep_concrete', 5), .4, t > T.run ? 1 + (t - T.run) * .08 : 1.1); k = st; } }
  sn(T.wall, 'impactPunch_heavy_000', 1); sn(T.wall + .05, 'hurt1', .6);
  sn(T.jump, 'jump1', .6); sn(T.land, 'impactSoft_heavy_000', .8);
  const zap = (t, land) => { sn(t, pick('laserLarge', 5), .75, .75); sn(t + land, 'lowFrequency_explosion_001', .6); };
  zap(T.bolt1, .2); sn(T.bolt1 + .2, 'explosionCrunch_001', .6);
  sn(T.roofJump, 'jump1', .5, 1.1); sn(T.onRoof, 'impactWood_light_002', .6);
  sn(T.a1, 'thrusterFire_000', .7); sn(T.hit1, 'explosionCrunch_002', .9); sn(T.hit1 + .03, 'impactMetal_heavy_000', .7);
  sn(T.leap, 'jump1', .5, .9); zap(T.bolt2, .25); sn(T.bolt2 + .25, 'explosionCrunch_003', .9); sn(T.bolt2 + .35, 'impactWood_heavy_002', .7); sn(T.down, 'impactSoft_heavy_002', .7);
  sn(T.a2miss, 'laserRetro_000', .6, 1.1); sn(T.a2miss + .4, 'woosh3', .4, 1.4);
  sn(T.a2, 'laserRetro_000', .7); sn(T.hit2, 'forceField_002', .8); sn(T.hit2 + .05, 'lowFrequency_explosion_001', .7);
  zap(T.bolt3, .2); sn(T.struck, 'hurt2', .7); sn(T.struck + .02, 'impactMetal_000', .5);
  sn(T.a3, 'secret1', .6); for (let i = 0; i < 6; i++) sn(T.a3 + .5 + i * .22, pick('laserSmall', 5), .45, 1.3);
  sn(T.a3 + 1, 'impactMetal_heavy_001', .8); sn(T.fall, 'fall1', .7);
  sn(T.crash, 'lowFrequency_explosion_000', 1); sn(T.crash + .02, 'explosionCrunch_004', .9); sn(T.crash + .1, 'stoneHit1', .7); sn(T.crash + .3, 'stoneHit3', .5);
  // the bat: a wooden crack and a metal clang off the hull
  sn(T.swing + .1, 'woosh1', .8); sn(T.contact, 'impactWood_heavy_003', 1, .9); sn(T.contact + .01, 'impactMetal_heavy_002', .9, .8); sn(T.contact + .02, 'hitHelmet1', .7);
  sn(T.contact + .1, 'woosh3', .6, .7);
  sn(T.flipEnd - .05, 'sinkWater1', 1, .55); sn(T.flipEnd, 'impactSoft_heavy_001', .9); sn(T.flipEnd + .2, 'sinkWater2', .6, .7);
  for (let i = 0; i < 4; i++) sn(T.sink + .3 + i * .5, 'drip' + (1 + i % 4), .45 - i * .08, .6);   // a few bubbles as it goes down
  sn(T.runEnd - 1.1, 'thrusterFire_002', .6); sn(T.runEnd - .5, 'forceField_003', .7);
  for (const d of wrecked) for (let t = d.rebuild + .3; t < d.rebuild + REB; t += rr(.35, .9))   // hammering and planks while each house goes up
    sn(t, rnd() < .25 ? pick('impactPlank_medium', 5) : rnd() < .5 ? 'chop' : pick('impactWood_light', 5), .22, rr(.9, 1.1));
  SND.sort((a, b) => a.t - b.t);
  const near = (p, r) => Math.hypot(p[0] - cx, p[1] - cz) < r, r1 = v => Math.round(v * 10) / 10;
  window.__scene = { ...window.__scene, map: { houses: D.map(d => [r1(d.x), r1(d.z), r1(d.h), r1(d.r)]), streets: ctx.streets.map(s => s.filter(p => near(p, 70)).map(p => p.map(r1))).filter(s => s.length),
    river: ctx.river.filter(p => near(p, 150)).map(p => p.map(r1)), targets: targets.map(d => D.indexOf(d)) } };
  fx.build();

  return {
    pixel: LOOKS[ctx.look] ?? 0, per: PER, sounds: SND, loops: LOOPS,
    update(t) {
      const lt = ((t % PER) + PER) % PER, cam = ctx.camera, yaw = Math.atan2(cam.position.x - cx, cam.position.z - cz); cam.updateMatrixWorld();
      const face = m => { m.rotation.y = Math.atan2(cam.position.x - m.position.x, cam.position.z - m.position.z); };
      const screen = (m, rz = 0) => { m.quaternion.copy(cam.quaternion); if (rz) m.rotateZ(rz); };
      const us = ufoState(lt, ufoAt(lt)); ufo.position.set(...us.p); ufo.show(lt < T.crash ? Math.floor(lt * 10) % 8 : 0, 0); screen(ufo, us.rz);
      ufo.material.uniforms.clipLo.value = us.clip; ufo.material.uniforms.alpha.value = 1 - (hits.some(h => lt >= h && lt < h + .4) && Math.floor(lt * 20) % 2 ? .6 : 0);
      const n = nessAt(lt); ness.visible = n.vis && n.bat < 0; bat.visible = n.vis && n.bat >= 0;
      // facing, from this camera: right, away, left or toward
      const e0 = cam.matrixWorld.elements, cr = [e0[0], e0[2]], cf = [-e0[8], -e0[10]];
      const dirCol = ([vx, vz]) => { const r = vx * cr[0] + vz * cr[1], f = vx * cf[0] + vz * cf[1]; return Math.abs(r) >= Math.abs(f) ? (r > 0 ? 0 : 12) : (f > 0 ? 6 : 18); };
      ness.material.uniforms.map.value = n.tex; ness.position.set(...n.p); ness.show((n.dir ? dirCol(n.dir) : 18) + n.frame, n.row); screen(ness);   // fully facing, so a steep camera doesn't flatten him
      bat.position.set(...n.p); bat.show(Math.max(0, n.bat), 0); screen(bat); bat.scale.x = n.dir && n.dir[0] * cr[0] + n.dir[1] * cr[1] < 0 ? -1 : 1;
      const pod = ufo.position, v3 = new THREE.Vector3(), camF = new THREE.Vector3(); cam.getWorldDirection(camF);
      for (const e of effects) { e.update(lt); if (!e.mesh.visible) continue;
        if (e.bolt) {   // stretch from the target up to the pod, in the camera's plane, and roll to point at it
          const v = v3.copy(pod).sub(e.mesh.position); v.addScaledVector(camF, -v.dot(camF));
          const a = e.mesh.position.clone().project(cam), b = pod.clone().project(cam);
          screen(e.mesh, Math.atan2(b.y - a.y, (b.x - a.x) * cam.aspect) - Math.PI / 2); e.mesh.scale.set(1, v.length() / e.len, 1); continue; }
        if (e.word) { screen(e.mesh, e.shake(lt)); continue; }
        let rz = 0; if (e.aim) { const a = new THREE.Vector3(...e.aim[0]).project(cam), b = new THREE.Vector3(...e.aim[1]).project(cam); rz = Math.atan2(b.y - a.y, (b.x - a.x) * cam.aspect); }
        screen(e.mesh, rz); }
      for (const d of D) {
        let v = d.versions[0]; for (const x of d.versions) if (x.t <= lt) v = x;
        const rebuilding = d.rebuild && lt >= d.rebuild;
        for (const x of d.versions) x.mesh.visible = x === v && !rebuilding;
        d.mat.uniforms.cut.value = 9999;
        if (rebuilding) { const w = d.versions[0].mesh, k = (lt - d.rebuild) / REB, n = ctx.steps(d.h); w.visible = true;   // storey by storey inside the scaffold, then it comes down
          if (k < 1) { d.mat.uniforms.cut.value = PLAIN + d.h * ctx.stepped(k, d.h); ctx.layers(d.sc, Math.min(n, k * n + .55) + .45); }
          else ctx.layers(d.sc, Math.max(0, n - (lt - d.rebuild - REB) / .4)); }
        else if (d.sc) ctx.layers(d.sc, 0);
        for (const c of d.chunks) { const a = lt - c.t0, sink = d.rebuild ? clamp01((lt - (d.rebuild - 2)) / 2) : 0; c.m.visible = a >= 0 && sink < 1; if (!c.m.visible) continue;
          const i = Math.min(c.frames.length / 7 - 1, Math.floor(a * 30)) * 7, f = c.frames; c.m.position.set(f[i], f[i + 1] - sink * 2, f[i + 2]); c.m.quaternion.set(f[i + 3], f[i + 4], f[i + 5], f[i + 6]); }
      }
      fx.update(lt); void yaw;
    },
    // from the street in front of the quarter, looking up toward the mountains so the saucer comes over the ridge, then down
    // onto the strikes
    camera(cam, t, aspect) {
      const lt = ((t % PER) + PER) % PER;
      let sh = 0; for (const s of SHAKES) { const a = lt - s.t; if (a >= 0 && a < 1.2) sh += s.a * Math.exp(-a * 4); }
      const back = aspect < 1 ? 1.35 : 1;
      cam.fov = aspect < 1 ? 64 : 48;
      // the opening: from the street in front of the quarter, up toward the mountains for the saucer, then down onto the strikes
      const wide = () => { const k = smooth((lt - 2) / 5);
        return [[cx - dm[0] * 56 * back + sd[0] * 24, PLAIN + lerp(16, 26, k) * back, cz - dm[1] * 56 * back + sd[1] * 24], [lerp(cx + dm[0] * 160, cx, k), lerp(PLAIN + 34, PLAIN + 13, k), lerp(cz + dm[1] * 160, cz, k)]]; };
      // closer shots from the same side, each framing what matters then
      const near = (p, dist, h, look = 0) => [[p[0] - fwd[0] * dist * back, p[1] + h * back, p[2] - fwd[1] * dist * back], [p[0], p[1] + look, p[2]]];
      const mid = (a, b, k = .5) => a.map((v, i) => lerp(v, b[i], k));
      // reverse angle: the camera on the far side, for the dodges
      const far = (p, dist, h, look = 0) => [[p[0] + fwd[0] * dist * back + rgt[0] * dist * .35, p[1] + h * back, p[2] + fwd[1] * dist * back + rgt[1] * dist * .35], [p[0], p[1] + look, p[2]]];
      const nP = () => nessAt(lt).p, uP = () => ufoState(lt, ufoAt(lt)).p;
      const SH = [
        [0, wide],
        [10.3, () => near(nessAt(Math.max(lt, T.out + .01)).p, 20, 6, 2.5)],
        [14.4, () => near(mid(nP(), uP(), .4), 30, 13, 0)],
        [15.4, () => far(mid(nP(), uP(), .5), 34, 12, 0), 1],                // dodge 1, reverse angle (cuts, never pans across)
        [16.5, () => near(mid(nP(), uP(), .4), 28, 12, 0), 1],               // to the roof, PK Fire
        [19.2, () => far(mid(nP(), uP(), .45), 36, 14, 0), 1],               // the roof blown off, reverse angle
        [20.5, () => near(mid(nP(), uP(), .45), 32, 14, 0), 1],              // plasma, the bolt that lands, Starstorm
        [T.crash - .4, () => near(mid(nessAt(lt).p, at3(C), .55), 26, 14, 1)],
        [T.run - .3, () => near(nessAt(Math.min(lt, T.runEnd - .01)).p, 16, 30, 1)],   // steep, over the roofs of the intact houses
        [T.runEnd + .8, () => near(ufoState(lt, ufoAt(lt)).p.map((v, i) => i === 1 ? Math.max(v, 1) : v), 18, 22, 0)],
        [T.runEnd + 5.4, () => { const k = (lt - T.runEnd - 5.4) / (PER - T.runEnd - 5.4), o = Math.sin(k * Math.PI) * 30; return near([cx + sd[0] * o * .4, PLAIN, cz + sd[1] * o * .4], 62, 30, 4); }],   // the rebuild
      ];
      let i = 0; while (i < SH.length - 1 && SH[i + 1][0] <= lt) i++;
      let [pos, tgt] = SH[i][1]();
      if (i > 0 && !SH[i][2]) { const k = smooth((lt - SH[i][0]) / 1.2); if (k < 1) { const [p0, t0] = SH[i - 1][1](); pos = mid(p0, pos, k); tgt = mid(t0, tgt, k); } }
      cam.position.set(pos[0] + Math.sin(lt * 37) * sh, pos[1] + Math.sin(lt * 53) * sh, pos[2] + Math.cos(lt * 41) * sh);
      cam.lookAt(...tgt); cam.aspect = aspect; cam.updateProjectionMatrix();
    },
  };
}
