// Particle effects for title-town scenes: dust plumes, smoke columns, fire, embers, flashes, splashes, shock rings and
// ground decals, from Kenney Smoke Particles, Kenney Particle Pack and Synty Particle FX textures (models/fx/).
// Every particle is planned when its emitter is added (birth time, life, start, velocity, growth), and drawn from the
// scene time alone, so capture mode can draw any moment exactly. One instanced quad mesh per texture.
// `tag` marks the particles of one event (set it before adding them); a scene's `dead(tag)` hides an event the player
// prevented. `burst()` reuses a small pool of particles for hits that happen live (the player's taps).
import * as THREE from 'three';

const TEX = {
  puff: ['whitePuff00', 'whitePuff03', 'whitePuff07', 'whitePuff12'], smoke: ['whitePuff00', 'whitePuff07'],   // tinted grey-lavender (Kenney's black smoke multiplies to near-black)
  flame: ['flame_02', 'flame_04', 'flame_05', 'fire_01', 'fire_02'], spark: ['spark_02', 'spark_05'], flash: ['flash00', 'flash03', 'explosion02'],
  dirt: ['dirt_01', 'dirt_02'], ring: ['PolygonParticles_Ring_01'], crack: ['PolygonParticles_GroundBreak_01'], scorch: ['scorch_01', 'scorch_02'],
};
const ADDITIVE = new Set(['flame', 'spark', 'flash']), FLAT = new Set(['ring', 'crack', 'scorch']);
const V = `attribute float aAlpha; varying vec2 vUv; varying float vA; varying vec3 vC, vW;
void main() { vUv = uv; vA = aAlpha; vC = instanceColor; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const F = `uniform sampler2D map; uniform float lum, night; uniform vec3 fogC; uniform float fogN, fogF; varying vec2 vUv; varying float vA; varying vec3 vC, vW;
void main() { vec4 t = texture2D(map, vUv); float a = t.a * mix(1., dot(t.rgb, vec3(.333)), lum) * vA; if (a < .01) discard;
  vec3 c = vC * mix(t.rgb, vec3(1.), lum * .5); float f = smoothstep(fogN, fogF, length(vW - cameraPosition));
  gl_FragColor = vec4(mix(c, fogC, f * (1. - lum)), a * (1. - f * .6)); }`;

let seedState = 1;
const rnd = () => ((seedState = (seedState * 1664525 + 1013904223) >>> 0) / 4294967296), rr = (a, b) => a + rnd() * (b - a);

export class FX {
  constructor(scene, camera, U) {
    this.scene = scene; this.camera = camera; this.groups = {}; this.parts = []; this.U = U; this.tag = null; this.dead = null; this.pool = []; this.poolAt = 0;
    const loader = new THREE.TextureLoader();
    for (const [kind, names] of Object.entries(TEX)) for (const n of names) {
      const tex = loader.load(`models/fx/${n}.png`); tex.colorSpace = THREE.SRGBColorSpace;
      this.groups[n] = { kind, tex, list: [] };
    }
  }
  // planned particles; kinds pick a texture at random within their family
  add(kind, p) { const names = TEX[kind]; p.tex = names[Math.floor(rnd() * names.length)]; p.kind = kind; p.tag = this.tag; this.groups[p.tex].list.push(p); this.parts.push(p); return p; }
  // n live hit bursts, planned now (before build) and moved to wherever and whenever a hit lands
  reserve(n = 6) { const tag = this.tag; this.tag = null;
    for (let i = 0; i < n; i++) { const set = []; set.push(this.add('flash', { born: -99, life: .3, p: [0, 0, 0], v: [0, 0, 0], size: 4, grow: 2, rot: rr(0, 6), color: '#ffe2b0', alpha: 1, fade: 'fast' }));
      for (let k = 0; k < 10; k++) { const a = rr(0, Math.PI * 2), e = rr(.2, 1.2), sp = rr(5, 11); set.push(this.add('spark', { born: -99, life: rr(.35, .7), p: [0, 0, 0], v: [Math.cos(a) * sp * Math.cos(e), Math.sin(e) * sp, Math.sin(a) * sp * Math.cos(e)], g: 14, size: rr(.35, .7), rot: 0, color: '#ffd08a', alpha: 1 })); }
      for (let k = 0; k < 4; k++) set.push(this.add('puff', { born: -99, life: rr(.6, 1), p: [0, 0, 0], v: [rr(-1.5, 1.5), rr(1, 2.5), rr(-1.5, 1.5)], drag: 1.5, size: rr(1.2, 2), grow: .9, rot: rr(0, 6), color: '#efe4d4', alpha: .6 }));
      this.pool.push(set); }
    this.tag = tag; }
  burst(t, [x, y, z], s = 1) { const set = this.pool[this.poolAt++ % this.pool.length]; if (!set) return;
    for (const p of set) { p.born = t + (p.kind === 'spark' ? rnd() * .05 : 0); p.p = [x, y, z]; p.s0 ??= p.size; p.size = p.s0 * s; } }
  dust(t, [x, y, z], s = 1, color = '#e9dccb') {   // a plume: puffs that burst out, rise and spread, then thin
    for (let i = 0; i < 18 * s; i++) { const a = rr(0, Math.PI * 2), sp = rr(1, 4) * s;
      this.add('puff', { born: t + rr(0, .25), life: rr(2.5, 4.5) * Math.sqrt(s), p: [x + rr(-1, 1) * s, y + rr(0, 1.5) * s, z + rr(-1, 1) * s], v: [Math.cos(a) * sp, rr(.8, 2.4) * s, Math.sin(a) * sp], drag: 1.2, size: rr(2, 3.6) * s, grow: rr(.7, 1.4), rot: rr(0, 6), spin: rr(-.4, .4), color, alpha: rr(.55, .85) }); }
  }
  flash(t, [x, y, z], s = 1) {
    this.add('flash', { born: t, life: .35, p: [x, y, z], v: [0, 0, 0], size: 5 * s, grow: 2, rot: rr(0, 6), color: '#ffd9a0', alpha: 1, fade: 'fast' });
    for (let i = 0; i < 14 * s; i++) { const a = rr(0, Math.PI * 2), e = rr(.2, 1.2), sp = rr(6, 14);
      this.add('spark', { born: t + rr(0, .1), life: rr(.4, .9), p: [x, y, z], v: [Math.cos(a) * sp * Math.cos(e), Math.sin(e) * sp, Math.sin(a) * sp * Math.cos(e)], g: 14, size: rr(.4, .8), rot: 0, color: '#ffc27a', alpha: 1 }); }
  }
  debris(t, [x, y, z], [dx, dz], s = 1) {   // dirt and grit sprayed in the direction of a hit
    for (let i = 0; i < 16 * s; i++) { const sp = rr(4, 11);
      this.add('dirt', { born: t + rr(0, .15), life: rr(.8, 1.6), p: [x, y, z], v: [dx * sp + rr(-3, 3), rr(3, 9), dz * sp + rr(-3, 3)], g: 16, size: rr(.6, 1.4) * s, grow: .3, rot: rr(0, 6), spin: rr(-3, 3), color: '#bfa58a', alpha: .9 }); }
  }
  splash(t, [x, z], s = 1) {
    for (let i = 0; i < 10 * s; i++) { const a = rr(0, Math.PI * 2), sp = rr(1, 3.5) * s;
      this.add('puff', { born: t + rr(0, .15), life: rr(.7, 1.3), p: [x, .2, z], v: [Math.cos(a) * sp, rr(3, 7) * s, Math.sin(a) * sp], g: 9, size: rr(1, 2) * s, grow: .8, rot: rr(0, 6), color: '#f4fbff', alpha: .9 }); }
  }
  ring(t, [x, y, z], s = 1) { this.add('ring', { born: t, life: 1.1, p: [x, y + .25, z], v: [0, 0, 0], size: 3 * s, grow: 9, rot: 0, color: '#f2e5bc', alpha: .8 }); }
  decal(t, end, kind, [x, y, z], s) { this.add(kind, { born: t, life: end - t, p: [x, y + .08, z], v: [0, 0, 0], size: s, grow: 0, rot: rr(0, 6), color: kind === 'crack' ? '#6b5d55' : '#3c3836', alpha: .85, fade: 'decal' }); }
  fire(t, end, [x, y, z], s = 1) {   // a burning house: flickering flames, a smoke column and rising embers, until `end`
    const n = Math.floor((end - t) * 9 * s);
    for (let i = 0; i < n; i++) { const b = t + i / (9 * s);
      this.add('flame', { born: b, life: rr(.6, 1.1), p: [x + rr(-1.5, 1.5) * s, y + rr(0, .8), z + rr(-1.5, 1.5) * s], v: [rr(-.3, .3), rr(2, 4), rr(-.3, .3)], size: rr(1.6, 3) * s, grow: -.4, rot: rr(-.3, .3), color: '#ffb067', alpha: 1 });
      if (i % 6 === 0) this.add('smoke', { born: b, life: rr(3, 4.5), p: [x + rr(-1, 1), y + 2 * s, z + rr(-1, 1)], v: [rr(.6, 1.6), rr(3.5, 5.5), rr(-.4, .4)], drag: .2, size: rr(1.2, 2) * s, grow: rr(.4, .7), rot: rr(0, 6), spin: rr(-.3, .3), color: '#c2b8c4', alpha: rr(.14, .24) });   // a thin column, so the action stays visible
      if (i % 3 === 0) this.add('spark', { born: b, life: rr(1.5, 2.5), p: [x + rr(-1, 1), y + 1.5, z + rr(-1, 1)], v: [rr(-1, 1), rr(3, 6), rr(-1, 1)], g: -.5, size: rr(.25, .45), rot: 0, color: '#ffcf8a', alpha: 1, wobble: 1 });
    }
  }
  build() {   // one instanced mesh per texture, sized to its planned particles
    const quad = new THREE.PlaneGeometry(1, 1);
    for (const [name, g] of Object.entries(this.groups)) {
      if (!g.list.length) continue;
      const mat = new THREE.ShaderMaterial({ vertexShader: V, fragmentShader: F, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: ADDITIVE.has(g.kind) ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: { map: { value: g.tex }, lum: { value: ADDITIVE.has(g.kind) || g.kind === 'dirt' ? 1 : 0 }, night: this.U.night, fogC: this.U.fogC, fogN: this.U.fogN, fogF: this.U.fogF } });
      const m = new THREE.InstancedMesh(quad, mat, g.list.length); m.frustumCulled = false; m.renderOrder = FLAT.has(g.kind) ? 1 : 5;
      m.geometry = quad.clone(); m.geometry.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(new Float32Array(g.list.length), 1));
      g.list.forEach((p, i) => m.setColorAt(i, new THREE.Color(p.color)));
      g.mesh = m; this.scene.add(m);
    }
  }
  update(lt) {
    const o = new THREE.Object3D(), cq = this.camera.quaternion, zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const g of Object.values(this.groups)) {
      if (!g.mesh) continue; const al = g.mesh.geometry.attributes.aAlpha;
      g.list.forEach((p, i) => {
        const a = lt - p.born;
        if (a < 0 || a > p.life || (p.tag != null && this.dead?.(p.tag))) { g.mesh.setMatrixAt(i, zero); al.array[i] = 0; return; }
        const k = a / p.life, d = p.drag ? (1 - Math.exp(-p.drag * a)) / p.drag : a;
        o.position.set(p.p[0] + p.v[0] * d + (p.wobble ? Math.sin(a * 5 + i) * .3 : 0), Math.max(p.p[1] * 0 + -50, p.p[1] + p.v[1] * d - .5 * (p.g || 0) * a * a), p.p[2] + p.v[2] * d);
        const s = Math.max(.01, p.size * (1 + (p.grow || 0) * a));
        if (FLAT.has(g.kind)) { o.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, p.rot)); }
        else { o.quaternion.copy(cq); o.rotateZ(p.rot + (p.spin || 0) * a); }
        o.scale.set(s, s, s); o.updateMatrix(); g.mesh.setMatrixAt(i, o.matrix);
        al.array[i] = p.alpha * (p.fade === 'fast' ? 1 - k : p.fade === 'decal' ? Math.min(1, a * 4) * (1 - Math.max(0, (k - .9) / .1)) : Math.min(1, a * 6) * (1 - k * k));
      });
      g.mesh.instanceMatrix.needsUpdate = true; al.needsUpdate = true;
    }
  }
}
export const reseed = s => { seedState = s >>> 0 || 1; };
