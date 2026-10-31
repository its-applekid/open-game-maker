// The EarthBound homage, beat 1: a pixel saucer (Hat Tap U.F.O. pack) rises over the mountains, glides to the market
// quarter and calls down lightning (pixelfx), each bolt breaking a real house (fracture and flight from rampage.js) and
// leaving it burning (pixelfx campfire); then Ness (LimeZu generator variant, tools/ness_sprite.py) blinks in.
// Every sprite and effect is a camera-facing billboard with nearest filtering; pixelfx effects are re-simulated from their
// start for any moment, so capture mode draws any time exactly. ?var=a|b|c: the look (b and c pixelate the whole frame).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FX, reseed } from './fx.js';
import { fracture, flight } from './rampage.js';
import { createFx, createFrame, clearFrame, composite } from './vendor/pixelfx/src/core/index.js';
import * as strikeFx from './vendor/pixelfx/src/fx/lightning/lightning-strike.js';
import * as blinkFx from './vendor/pixelfx/src/fx/arcane/blink-in.js';
import * as fireFx from './vendor/pixelfx/src/fx/fire/campfire.js';
import * as blastFx from './vendor/pixelfx/src/fx/explosions/dirt-explosion.js';

export const PER = 24;
const clamp01 = x => Math.min(1, Math.max(0, x)), smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
let seed = 5; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296), rr = (a, b) => a + rnd() * (b - a);
const hashN = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
export const LOOKS = { a: 0, b: 224, c: 160 };   // lines the frame is rendered at: full, SNES, GBA

// ---------------- pixel billboards ----------------
// upright planes that turn to face the camera; `lit` sprites take the day/night light, effects glow as drawn
const SPR_V = `varying vec2 vUv; varying vec3 vW; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SPR_F = `uniform sampler2D map; uniform vec2 off, rep; uniform float lit, alpha, clipY; uniform vec3 amb, sunC, fogC; uniform float fogN, fogF; varying vec2 vUv; varying vec3 vW;
void main() { if (vW.y > clipY) discard; vec4 t = texture2D(map, off + vUv * rep); if (t.a < .5 && lit > .5) discard;
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
    uniforms: { map: { value: tex }, off: { value: new THREE.Vector2(0, 0) }, rep: { value: new THREE.Vector2(1, 1) }, lit: { value: lit ? 1 : 0 }, alpha: { value: 1 }, clipY: { value: 1e9 },
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
    mesh.material.uniforms.alpha.value = o.until ? clamp01((e.end - lt) / .8) : 1;
  };
  return e;
}

// ctx: { scene, camera, U, PLAIN, ground(x, z), kenney(path), kitMat(map, o), houses: [{x, z, rot, s, model, roof}], centre: [x, z], mountains: [x, z], square: [x, z], look }
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
      d.chunks.push({ m, t0: t, frames: flight(p, [out[0] / ol * sp + rr(-2, 2), rr(5, 12) * power, out[1] / ol * sp + rr(-2, 2)], [rr(-1, 1), rr(-1, 1), rr(-1, 1)].map(x => x * rr(2, 9)), c.r, ground, fx, t) });
    }
    fx.debris(t, [d.x, PLAIN + top + 1, d.z], [0, 0], .5 + power * .3);   // grit only: the dust and fire are pixelfx
    SHAKES.push({ t, a: .35 * power });
  }
  // ---- the saucer: over the ridge, across the sky, hovering and drifting over each target as it strikes
  const ufoTex = await load('models/sprites/ufo/ufo_spritesheet.png'), ufo = sheetSprite(scene, U, ufoTex, 66, 49, .32, 33, 25);
  const ridgeAt = [cx + dm[0] * 230, cz + dm[1] * 230], ridgeY = ground(...ridgeAt);
  const targets = D.slice().sort((a, b) => (b.h - a.h) || 0).slice(0, 6).sort((a, b) => ((a.x - cx) * sd[0] + (a.z - cz) * sd[1]) - ((b.x - cx) * sd[0] + (b.z - cz) * sd[1]));
  const HOVER = 24, STRIKE0 = 7.4, GAP = 1.4;
  const keys = [[0, ridgeAt[0], ridgeY - 14, ridgeAt[1]], [.6, ridgeAt[0], ridgeY - 14, ridgeAt[1]], [3, ridgeAt[0], ridgeY + 20, ridgeAt[1]]];   // rises from behind the ridge
  targets.forEach((d, i) => keys.push([STRIKE0 - .45 + i * GAP, d.x, PLAIN + HOVER, d.z], [STRIKE0 + .75 + i * GAP, d.x, PLAIN + HOVER, d.z]));   // holds over each target while the bolt falls
  keys.splice(3, 0, [STRIKE0 - 1.3, lerp(ridgeAt[0], targets[0].x, .92), PLAIN + HOVER + 8, lerp(ridgeAt[1], targets[0].z, .92)]);   // the glide in
  keys.push([STRIKE0 + targets.length * GAP + 1.6, cx + dm[0] * 12, PLAIN + HOVER + 10, cz + dm[1] * 12]);
  const ufoAt = t => { let i = 0; while (i < keys.length - 2 && keys[i + 1][0] <= t) i++; const a = keys[i], b = keys[i + 1], k = smooth((t - a[0]) / (b[0] - a[0]));
    return [lerp(a[1], b[1], k), lerp(a[2], b[2], k) + Math.sin(t * 2.2) * .8, lerp(a[3], b[3], k)]; };
  // ---- the strikes: a bolt from the saucer onto each target; the house blows apart as the bolt lands, then burns
  const effects = [];
  targets.forEach((d, i) => {
    const t0 = STRIKE0 + i * GAP, land = t0 + .7;
    const bolt = pxEffect(scene, U, strikeFx, t0, [d.x, PLAIN, d.z], .2, { seed: 3 + i }); bolt.mesh.material.uniforms.clipY.value = PLAIN + HOVER - 3;   // chunky, cut off at the saucer's belly
    effects.push(bolt);
    blast(d, land, d.h * rr(.15, .35), 1.2);
    effects.push(pxEffect(scene, U, blastFx, land - .05, [d.x, PLAIN, d.z], .09, { seed: 21 + i }));
    for (const o of D) if (o !== d && Math.hypot(o.x - d.x, o.z - d.z) < 7 && !targets.includes(o)) blast(o, land + .1, o.h * rr(.55, .75), .6);
    effects.push(pxEffect(scene, U, fireFx, land + .3, [d.x, PLAIN + d.h * .3, d.z], .1, { seed: 9 + i, until: PER - .3 }));
  });
  // ---- Ness blinks in on the street in front of the quarter
  const nessTex = await load('models/sprites/variants/ness.png'), NPX = .1, ness = sheetSprite(scene, U, nessTex, 32, 64, NPX, 16, 62);
  const nAt = ctx.square, BLINK = STRIKE0 + targets.length * GAP + 1.4;
  ness.position.set(nAt[0], ground(...nAt), nAt[1]);
  effects.push(pxEffect(scene, U, blinkFx, BLINK, [nAt[0], ground(...nAt), nAt[1]], NPX * 1.1, { seed: 2 }));
  fx.build();

  return {
    pixel: LOOKS[ctx.look] ?? 0,
    update(t) {
      const lt = ((t % PER) + PER) % PER, cam = ctx.camera, yaw = Math.atan2(cam.position.x - cx, cam.position.z - cz);
      const face = m => { m.rotation.y = Math.atan2(cam.position.x - m.position.x, cam.position.z - m.position.z); };
      const u = ufoAt(lt); ufo.position.set(...u); ufo.show(Math.floor(lt * 8) % 3, 0); face(ufo);
      ness.visible = lt > BLINK + .9; ness.show(18 + Math.floor(lt * 6) % 6, 1); face(ness);
      for (const e of effects) { e.update(lt); face(e.mesh); }
      for (const d of D) {
        let v = d.versions[0]; for (const x of d.versions) if (x.t <= lt) v = x;
        for (const x of d.versions) x.mesh.visible = x === v;
        for (const c of d.chunks) { const a = lt - c.t0; c.m.visible = a >= 0; if (!c.m.visible) continue;
          const i = Math.min(c.frames.length / 7 - 1, Math.floor(a * 30)) * 7, f = c.frames; c.m.position.set(f[i], f[i + 1], f[i + 2]); c.m.quaternion.set(f[i + 3], f[i + 4], f[i + 5], f[i + 6]); }
      }
      fx.update(lt); void yaw;
    },
    // from the street in front of the quarter, looking up toward the mountains so the saucer comes over the ridge, then down
    // onto the strikes
    camera(cam, t, aspect) {
      const lt = ((t % PER) + PER) % PER;
      let sh = 0; for (const s of SHAKES) { const a = lt - s.t; if (a >= 0 && a < 1.2) sh += s.a * Math.exp(-a * 4); }
      const k = smooth((lt - 2) / 5), back = aspect < 1 ? 1.35 : 1;
      cam.fov = aspect < 1 ? 64 : 48;
      cam.position.set(cx - dm[0] * 56 * back + sd[0] * 24 + Math.sin(lt * 37) * sh, PLAIN + lerp(16, 26, k) * back + Math.sin(lt * 53) * sh, cz - dm[1] * 56 * back + sd[1] * 24 + Math.cos(lt * 41) * sh);
      cam.lookAt(lerp(cx + dm[0] * 160, cx, k), lerp(PLAIN + 34, PLAIN + 13, k), lerp(cz + dm[1] * 160, cz, k)); cam.aspect = aspect; cam.updateProjectionMatrix();
    },
  };
}
