// Title directions A and B in three.js: Kenney models drawn as frosted glass over the living background, made piece by piece,
// then painted in by flying paint (colour spreads from where the paint lands, with a ragged wet gruvbox edge and droplets).
// A: a small glass city under construction (two cranes, buildings rising floor by floor, cars, paint landing on finished blocks).
// B: a floating island of four game worlds (dungeon, castle, space dock, forest), each built in glass and then painted in turn.
// Cheap on purpose: one unlit shader (no lights, shadows or transmission pass), pixel ratio capped, about 30 fps on phones,
// renders only while the title screen shows and the tab is visible; reduced motion draws one finished frame.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PAINT = ['#fb4934', '#fabd2f', '#b8bb26', '#83a598', '#d3869b', '#8ec07c', '#fe8019'].map(c => new THREE.Color(c));
const SPLASH = ['drip1', 'drip2', 'drip3'];
const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
const clamp01 = x => Math.min(1, Math.max(0, x)), ease = x => 1 - (1 - clamp01(x)) ** 3, smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const back = x => { x = clamp01(x); const c = 1.6; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };

// ---------------- the glass / paint shader ----------------
const VERT = `
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG = `
uniform sampler2D map; uniform float hasMap; uniform vec3 color;
uniform vec3 hit; uniform float reveal; uniform vec3 paint; uniform float tint; uniform float cut; uniform float fade; uniform float seed;
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1., 0., 0.)), f.x), mix(hash(i + vec3(0., 1., 0.)), hash(i + vec3(1., 1., 0.)), f.x), f.y),
             mix(mix(hash(i + vec3(0., 0., 1.)), hash(i + vec3(1., 0., 1.)), f.x), mix(hash(i + vec3(0., 1., 1.)), hash(i + vec3(1., 1., 1.)), f.x), f.y), f.z);
}
void main() {
  if (vW.y > cut) discard;
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(cameraPosition - vW);
  vec3 base = color; if (hasMap > 0.5) base *= texture2D(map, vUv).rgb;
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  float key = max(dot(n, normalize(vec3(0.45, 0.85, 0.3))), 0.0);
  float fres = pow(1.0 - abs(dot(n, v)), 2.0);
  // frosted glass: pale and cool, lit on top faces and rims, the model's own detail kept as faint shading, a little grain
  vec3 glass = mix(vec3(0.16, 0.18, 0.27), vec3(0.95, 0.93, 0.9), 0.12 + 0.38 * key + 0.6 * fres) * (0.7 + 0.6 * lum);
  glass += (hash(vec3(gl_FragCoord.xy, 1.0)) - 0.5) * 0.05;
  float ga = 0.1 + 0.2 * key + 0.55 * fres;
  // paint: spreads from where it landed, a ragged edge, a wet rim in the paint colour and droplets just beyond it
  float d = distance(vW, hit);
  float rag = (noise(vW * 5.0 + seed) - 0.5) * 0.55 * (0.25 + reveal) + (noise(vW * 17.0 + seed) - 0.5) * 0.14;
  float m = 1.0 - smoothstep(reveal - 0.03, reveal, d + rag);
  float drops = step(0.8, noise(vW * 21.0 + seed * 3.0)) * (1.0 - smoothstep(reveal, reveal * 1.35 + 0.06, d)) * step(0.001, reveal);
  float wet = smoothstep(reveal - 0.2, reveal - 0.02, d + rag) * m * (1.0 - smoothstep(2.0, 4.0, reveal));
  vec3 lit = mix(base, paint * (0.3 + 0.95 * lum), tint) * (0.6 + 0.6 * key) + fres * 0.1;   // painted: the model's colours pulled toward its paint
  vec3 col = mix(glass, lit, m);
  col = mix(col, paint * (0.75 + 0.45 * key), max(wet * 0.9, drops * (1.0 - m)));
  float a = mix(ga, 1.0, max(m, drops));
  // the build line: a warm seam where the model is still being made
  float seam = (1.0 - smoothstep(0.0, 0.035, cut - vW.y)) * step(cut, 50.0);
  col = mix(col, vec3(1.0, 0.8, 0.4), seam); a = max(a, seam);
  gl_FragColor = vec4(col, a * fade);
  #include <colorspace_fragment>
}`;
// shared uniforms for one thing that is built and painted as a whole (a building, a zone of the island); reveal 99 = fully painted
const U = (o = {}) => ({ hit: { value: new THREE.Vector3() }, reveal: { value: 0 }, paint: { value: pick(PAINT) },
  seed: { value: rnd(0, 50) }, tint: { value: .45 }, cut: { value: 99 }, fade: { value: 1 }, ...o });
function glassMat(src, u, extra = {}) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, ...extra,
    uniforms: { map: { value: src.map || null }, hasMap: { value: src.map ? 1 : 0 }, color: { value: (src.color || new THREE.Color(1, 1, 1)).clone() }, ...u } });
}
const solid = (color, u) => glassMat({ color: new THREE.Color(color) }, u);

// ---------------- models ----------------
const loader = new GLTFLoader(), cache = new Map(), maps = new Map();
function load(kit, name) {
  const k = kit + '/' + name;
  if (!cache.has(k)) cache.set(k, loader.loadAsync(`art/3d/${kit}/${name}.json`).then(g => {
    g.scene.traverse(m => { if (m.isMesh && m.material.map) { if (!maps.has(kit)) maps.set(kit, m.material.map); m.material.map = maps.get(kit); } });
    g.scene.userData.box = new THREE.Box3().setFromObject(g.scene); return g.scene;
  }));
  return cache.get(k);
}
const preload = list => Promise.all(list.map(([kit, ...names]) => Promise.all(names.map(n => load(kit, n)))));
async function piece(kit, name, u, scale = 1) {
  const src = await load(kit, name), o = src.clone(true);
  o.traverse(m => { if (m.isMesh) m.material = glassMat(m.material, u); });
  o.scale.setScalar(scale); o.userData.box = src.userData.box.clone().applyMatrix4(new THREE.Matrix4().makeScale(scale, scale, scale));
  return o;
}

// ---------------- flying paint ----------------
function paintFX(scene, cue) {
  const geo = new THREE.IcosahedronGeometry(1, 1), live = [], drops = [];
  const up = new THREE.Vector3(), tmp = new THREE.Vector3();
  return {
    // a blob of paint arcs from `from` to `to` in `dur` seconds, bursts into droplets and calls onHit
    fire(from, to, color, dur, onHit) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color })); scene.add(m);
      live.push({ m, from: from.clone(), to: to.clone(), t: 0, dur, onHit, color, arc: from.distanceTo(to) * .25 });
    },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const b = live[i]; b.t += dt; const k = clamp01(b.t / b.dur);
        const at = k2 => tmp.lerpVectors(b.from, b.to, k2).add(up.set(0, 4 * b.arc * k2 * (1 - k2), 0)).clone();
        const p = at(k), q = at(Math.min(1, k + .02));
        b.m.position.copy(p); if (k < 1) b.m.lookAt(q); b.m.scale.set(.16, .16, .18 + .22 * k);
        if (k >= 1) {
          scene.remove(b.m); live.splice(i, 1); b.onHit?.(); cue?.(pick(SPLASH), .22);
          for (let j = 0; j < 7; j++) {
            const d = new THREE.Mesh(geo, b.m.material); d.position.copy(b.to); d.scale.setScalar(rnd(.04, .08)); scene.add(d);
            drops.push({ m: d, v: new THREE.Vector3(rnd(-1.4, 1.4), rnd(.6, 2), rnd(-1.4, 1.4)), t: 0, life: rnd(.4, .7) });
          }
        }
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]; d.t += dt; d.v.y -= 6 * dt; d.m.position.addScaledVector(d.v, dt); d.m.scale.multiplyScalar(1 - dt * 1.5);
        if (d.t > d.life) { scene.remove(d.m); drops.splice(i, 1); }
      }
    },
  };
}

// ---------------- A: glass city under construction ----------------
const CITY = [['city', 'building-a', 'building-b', 'building-c', 'building-d', 'building-f', 'building-g', 'building-h', 'building-l', 'building-m',
  'building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c', 'building-skyscraper-d', 'building-skyscraper-e'],
  ['suburb', 'building-type-a', 'building-type-c', 'building-type-f', 'building-type-k', 'tree-large', 'tree-small'],
  ['roads', 'road-straight', 'road-crossroad', 'construction-cone', 'construction-barrier', 'light-square'],
  ['cars', 'taxi', 'sedan', 'police', 'delivery', 'van']];
const TALL = ['building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c', 'building-skyscraper-d', 'building-skyscraper-e', 'building-l', 'building-m'];
const LOW = [['city', 'building-a'], ['city', 'building-b'], ['city', 'building-c'], ['city', 'building-d'], ['city', 'building-f'], ['city', 'building-g'],
  ['city', 'building-h'], ['suburb', 'building-type-a'], ['suburb', 'building-type-c'], ['suburb', 'building-type-f'], ['suburb', 'building-type-k']];

async function city({ scene, fx, reduced }) {
  await preload(CITY);
  const root = new THREE.Group(); scene.add(root);
  const ground = U({ fade: { value: .55 } });
  // the model's base: a thick glass slab, four kerbed blocks and two crossing roads (merged into one mesh)
  const slab = new THREE.Mesh(new THREE.BoxGeometry(9.8, .5, 9.8).translate(0, -.25, 0), solid('#cfd6e6', ground)); slab.renderOrder = -3; root.add(slab);
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(4.3, .06, 4.3).translate(x * 2.6, .03, z * 2.6), solid('#d9d2c0', ground)); b.renderOrder = -2; root.add(b);
  }
  const roadGeo = [];
  const grab = async name => { let g; (await load('roads', name)).traverse(m => { if (m.isMesh && !g) g = m; }); return g; };
  const rs = await grab('road-straight'), rx = await grab('road-crossroad');
  for (let i = -4; i <= 4; i++) for (const along of [0, 1]) {
    if (i === 0 && along) continue;
    const src = i === 0 ? rx : rs, g = src.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(along ? Math.PI / 2 : 0)).translate(along ? i : 0, 0, along ? 0 : i);
    roadGeo.push(g);
  }
  const roads = new THREE.Mesh(mergeGeometries(roadGeo), glassMat(rs.material, U({ reveal: { value: 99 }, tint: { value: 0 } }))); roads.renderOrder = -1; root.add(roads);

  // street lights and trees: painted from the start, they set the scene's colour
  for (const [x, z, r] of [[.7, 2.2, 0], [-.7, -2.4, Math.PI], [2.3, -.7, -Math.PI / 2], [-2.2, .7, Math.PI / 2]]) {
    const l = await piece('roads', 'light-square', U(), .9); l.position.set(x, 0, z); l.rotation.y = r; root.add(l);
  }
  for (const [x, z, s] of [[4.6, 2.5, 1.4], [4.6, -1, 1.2], [-4.6, 3.6, 1.3], [-4.6, -2.4, 1.5], [2.4, 4.6, 1.2], [-1.2, -4.6, 1.4], [-3.4, 4.6, 1.2]]) {
    const t = await piece('suburb', pick(['tree-large', 'tree-small']), U({ reveal: { value: 99 }, tint: { value: 0 } }), s); t.position.set(x, .06, z); root.add(t);
  }

  // cranes: yellow, the one opaque colour that is always there; each owns the plots it can reach
  const cranes = [[2.5, 2.5, 4.4], [-2.5, -2.5, 4.4]].map(([x, z, h]) => {
    const u = U({ reveal: { value: 99 }, tint: { value: 0 } }), mat = solid('#fabd2f', u), dark = solid('#3c3836', u), g = new THREE.Group();
    const box = (w, hh, d, x2, y2, z2, m = mat) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m); b.position.set(x2, y2, z2); return b; };
    g.position.set(x, 0, z); root.add(g);
    for (const [ox, oz] of [[-.05, -.05], [.05, -.05], [-.05, .05], [.05, .05]]) g.add(box(.025, h, .025, ox, h / 2, oz));
    for (let y = .3; y < h; y += .3) g.add(box(.12, .02, .12, 0, y, 0));
    const top = new THREE.Group(); top.position.y = h; g.add(top);
    top.add(box(4.6, .07, .09, 2.1, .05, 0), box(1.3, .08, .1, -.75, .05, 0), box(.3, .22, .22, -1.2, -.05, 0, dark), box(.18, .18, .16, .05, -.08, 0, dark));
    top.add(box(.04, .5, .04, 0, .3, 0));
    const trolley = box(.14, .05, .12, 2, -.02, 0, dark); top.add(trolley);
    const cable = box(.012, 1, .012, 0, 0, 0, dark); top.add(cable);
    const hook = box(.06, .08, .06, 0, 0, 0, dark); top.add(hook);
    const slabM = new THREE.Mesh(new THREE.BoxGeometry(.9, .08, .9), solid('#cfd6e6', U())); slabM.visible = false; top.add(slabM);
    return { x, z, h, top, trolley, cable, hook, load: slabM, busy: null, yaw: 0, reach: 4.3 };
  });
  const setHook = (c, dist, y) => {   // y: hook height in world units
    const drop = Math.max(.1, c.h - y);
    c.trolley.position.x = dist; c.cable.position.set(dist, -drop / 2, 0); c.cable.scale.y = drop; c.hook.position.set(dist, -drop - .04, 0);
    c.load.position.set(dist, -drop - .12, 0);
  };
  for (const c of cranes) setHook(c, 2, c.h - .8);

  // cones and a barrier move to whichever plot is being built
  const cones = [];
  for (let i = 0; i < 3; i++) { const o = await piece('roads', 'construction-cone', U({ reveal: { value: 99 }, tint: { value: 0 } }), .35); root.add(o); cones.push(o); }
  const barrier = await piece('roads', 'construction-barrier', U({ reveal: { value: 99 }, tint: { value: 0 } }), .45); root.add(barrier);

  // sixteen plots, each cycling: build (crane or "printed") → glass → painted → paint washes off → taken down → rebuilt
  const plots = [];
  for (const x of [-3.5, -1.5, 1.5, 3.5]) for (const z of [-3.5, -1.5, 1.5, 3.5]) {
    const inner = Math.abs(x) === 1.5 && Math.abs(z) === 1.5;
    const r = Math.abs(x) === 1.5 ? (x > 0 ? -Math.PI / 2 : Math.PI / 2) : Math.abs(z) === 1.5 ? (z > 0 ? Math.PI : 0) : pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
    plots.push({ x, z, r, inner, u: null, obj: null, state: 'gone', t: 0, dur: 1, crane: null });
  }
  async function newBuilding(p) {
    if (p.obj) { root.remove(p.obj); p.obj = null; }
    const [kit, name] = p.inner || Math.random() < .25 ? ['city', pick(TALL)] : pick(LOW);
    p.u = U(); p.obj = await piece(kit, name, p.u, kit === 'suburb' ? .95 : 1);
    p.obj.position.set(p.x, .06, p.z); p.obj.rotation.y = p.r; root.add(p.obj);
    const b = p.obj.userData.box; p.h = b.max.y - b.min.y; p.w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
    p.floors = Math.max(2, Math.round(p.h / .42));
  }
  const go = (p, state, dur) => { p.state = state; p.t = 0; p.dur = dur; };
  function startBuild(p, instant) {
    const c = !instant && cranes.find(c => !c.busy && Math.hypot(c.x - p.x, c.z - p.z) < c.reach);
    p.crane = c || null; if (c) { c.busy = p; c.yawTo = Math.atan2(-(p.z - c.z), p.x - c.x); c.dist = Math.hypot(p.x - c.x, p.z - c.z); }
    cones.forEach((o, i) => { const a = p.r + (i - 1) * .55; o.position.set(p.x + Math.sin(a) * 1.02, .06, p.z + Math.cos(a) * 1.02); });
    barrier.position.set(p.x + Math.sin(p.r + Math.PI / 2) * 1.02, .06, p.z + Math.cos(p.r + Math.PI / 2) * 1.02); barrier.rotation.y = p.r + Math.PI / 2;
    go(p, 'build', c ? p.floors * 1.7 + 1.2 : rnd(5, 8));
  }
  function splat(p) {
    const cam = scene.userData.camera.position, dir = new THREE.Vector3(cam.x - p.x, 0, cam.z - p.z).normalize();
    const hit = new THREE.Vector3(p.x, .06 + p.h * rnd(.45, .8), p.z).addScaledVector(dir, p.w * .45);
    const from = hit.clone().add(new THREE.Vector3(rnd(-3, 3), rnd(5, 7), rnd(-3, 3)));
    p.u.paint.value = pick(PAINT); p.u.hit.value.copy(hit);
    go(p, 'fly', .7); fx.fire(from, hit, p.u.paint.value, .7, () => go(p, 'paint', 1.6));
  }
  // first frame already mixed: some painted, some glass, a few rising
  await Promise.all(plots.map(newBuilding));
  for (const p of plots) {
    const roll = reduced ? (Math.random() < .6 ? 0 : .7) : Math.random();
    if (roll < .4) { go(p, 'painted', rnd(4, 24)); p.u.hit.value.set(p.x, p.h / 2, p.z); p.u.reveal.value = (p.w + p.h) * 1.2; }
    else if (roll < .78) go(p, 'glass', rnd(1, 8));
    else { startBuild(p, true); p.t = rnd(0, p.dur * .7); }
  }

  let beat = 0;
  function update(t, dt) {
    for (const p of plots) {
      p.t += dt; const k = p.t / p.dur, u = p.u;
      if (!u) continue;
      if (p.state === 'build') {
        if (p.crane) {   // one floor per lift: the hook lowers a slab, the floor appears, the hook goes back up
          const c = p.crane, lift = Math.max(0, p.t - 1.2) / 1.7, f = Math.min(p.floors, Math.floor(lift)), fr = lift - Math.floor(lift);
          const floorsDone = Math.min(p.floors, f + smooth((fr - .55) / .3)), top = .06 + p.h * floorsDone / p.floors;
          u.cut.value = p.t < 1.2 ? .06 : top;
          const target = .06 + p.h * Math.min(p.floors, f + 1) / p.floors + .12;
          const hookY = p.t < 1.2 || f >= p.floors ? c.h - .6 : fr < .55 ? THREE.MathUtils.lerp(c.h - .6, target, ease(fr / .55)) : fr < .85 ? target : THREE.MathUtils.lerp(target, c.h - .6, ease((fr - .85) / .15));
          const dy = Math.atan2(Math.sin(c.yawTo - c.yaw), Math.cos(c.yawTo - c.yaw)); c.yaw += dy * Math.min(1, dt * 2.2); c.top.rotation.y = c.yaw;
          setHook(c, c.dist, hookY); c.load.visible = p.t > 1.2 && f < p.floors && fr < .6;
        } else u.cut.value = .06 + p.h * smooth(k);
        if (k >= 1) { u.cut.value = 99; if (p.crane) { p.crane.busy = null; p.crane.load.visible = false; p.crane = null; } go(p, 'glass', rnd(2, 5)); }
      } else if (p.state === 'paint') { u.reveal.value = (p.w + p.h) * 1.2 * ease(k); if (k >= 1) go(p, 'painted', rnd(14, 26)); }
      else if (p.state === 'wash') { u.reveal.value = (p.w + p.h) * 1.2 * (1 - smooth(k)); if (k >= 1) { u.reveal.value = 0; go(p, 'down', 1.6); } }
      else if (p.state === 'down') { u.cut.value = .06 + p.h * (1 - smooth(k)); if (k >= 1) { go(p, 'gone', rnd(.5, 2)); } }
      else if (p.state === 'painted' && k >= 1) go(p, 'wash', 1.2);
      else if (p.state === 'gone' && k >= 1 && !p.loading) { p.loading = true; newBuilding(p).then(() => { p.loading = false; p.u.cut.value = .06; startBuild(p); }); }
    }
    // paint lands on one waiting glass building at a time, every couple of seconds
    beat -= dt;
    if (beat <= 0) { const g = plots.filter(p => p.state === 'glass' && p.t >= p.dur); if (g.length) { splat(pick(g)); beat = rnd(1.6, 2.8); } else beat = .5; }
    for (const c of cranes) if (!c.busy) { c.yaw += Math.sin(t * .3 + c.x) * dt * .05; c.top.rotation.y = c.yaw; }
    cars(t, dt);
  }

  // traffic on both roads, half the cars already painted
  const lanes = [[1, 0, .22], [-1, 0, -.22], [0, 1, -.22], [0, -1, .22]], fleet = [];
  for (let i = 0; i < 5; i++) {
    const u = U({ reveal: { value: Math.random() < .5 ? 99 : 0 }, tint: { value: .2 } }), o = await piece('cars', pick(['taxi', 'sedan', 'police', 'delivery', 'van']), u, .2);
    root.add(o); fleet.push({ o, u, lane: lanes[i % 4], s: rnd(-5, 5), v: rnd(.5, .8) });
  }
  function cars(t, dt) {
    for (const c of fleet) {
      c.s += c.v * dt; if (c.s > 5) { c.s = -5; c.u.reveal.value = Math.random() < .5 ? 99 : 0; }
      const [dx, dz, off] = c.lane, s = c.s;
      c.o.position.set(dx ? s * dx : off, .02, dz ? s * dz : off); c.o.rotation.y = Math.atan2(dx, dz);
      c.u.fade.value = smooth((5 - Math.abs(s)) / .5);
    }
  }
  cars(0, 0);
  if (reduced) for (const p of plots) if (p.state === 'build') { p.u.cut.value = 99; go(p, 'glass', 99); }
  return {
    update,
    camera(cam, t, aspect) {   // a slow orbit, closer and with a wider lens in portrait
      const a = .7 + t * Math.PI * 2 / 160, portrait = aspect < 1, d = portrait ? 33 : aspect < 1.5 ? 24 : aspect > 2 ? 25 : 22;
      cam.fov = portrait ? 40 : 30; cam.position.set(Math.sin(a) * d, d * .6, Math.cos(a) * d); cam.lookAt(0, portrait ? 2.4 : 2, 0);
    },
  };
}

// ---------------- B: a floating island of game worlds ----------------
const ISLAND = [['dungeon', 'floor', 'floor-detail', 'wall', 'wall-opening', 'column', 'chest', 'barrel', 'character-orc', 'character-human', 'banner', 'weapon-sword'],
  ['castle', 'tower-square-base', 'tower-square-mid-windows', 'tower-square-top-roof-high', 'wall', 'wall-corner', 'gate', 'flag', 'tree-large'],
  ['space', 'rocket_baseA', 'rocket_fuelA', 'rocket_sidesA', 'rocket_finsA', 'rocket_topA', 'satelliteDish_large', 'rock_crystalsLargeA', 'astronautA'],
  ['nature', 'tree_pineTallA', 'tree_pineRoundC', 'tree_default', 'tree_oak', 'rock_largeA', 'mushroom_redGroup', 'flower_yellowA', 'campfire_stones', 'tent_smallOpen']];
// each zone: ground colour, paint colour and pieces [kit, name, x, y, z, rotY, scale] in zone space (back of the zone is -z, outward)
const ZONES = [
  { ground: '#7c6f64', paint: '#d3869b', pieces: [
    ...[-1, 0, 1].flatMap(x => [-1, 0, 1].map(z => ['dungeon', (x + z) % 2 ? 'floor-detail' : 'floor', x, 0, z, 0, 1])),
    ['dungeon', 'wall', -1, 0, -1.5, 0, 1], ['dungeon', 'wall-opening', 0, 0, -1.5, 0, 1], ['dungeon', 'wall', 1, 0, -1.5, 0, 1],
    ['dungeon', 'banner', 1, 0, -1.02, 0, 1], ['dungeon', 'column', -1.2, 0, -.8, 0, .8], ['dungeon', 'column', 1.2, 0, .9, 0, .8],
    ['dungeon', 'chest', .6, 0, -.6, -.4, 1], ['dungeon', 'barrel', -1.1, 0, .5, 0, .8], ['dungeon', 'barrel', -.7, 0, 1, 0, .7],
    ['dungeon', 'character-orc', .3, 0, .5, 2.6, .9, 'hop'], ['dungeon', 'character-human', -.4, 0, -.1, .7, .9, 'hop'], ['dungeon', 'weapon-sword', .9, 0, .2, 1, .9]] },
  { ground: '#98971a', paint: '#fe8019', pieces: [
    ['castle', 'tower-square-base', -.9, 0, -.9, 0, .8], ['castle', 'tower-square-mid-windows', -.9, .8, -.9, 0, .8], ['castle', 'tower-square-top-roof-high', -.9, 1.6, -.9, 0, .8],
    ['castle', 'flag', -.9, 2.65, -.9, 0, .8, 'wave'], ['castle', 'wall', .1, 0, -.9, 0, .8], ['castle', 'wall-corner', 1, 0, -.9, 0, .8],
    ['castle', 'wall', 1, 0, 0, Math.PI / 2, .8], ['castle', 'gate', 1, 0, .9, Math.PI / 2, .8], ['castle', 'tree-large', -.6, 0, .9, 0, 1], ['castle', 'tree-large', .1, 0, 1.2, 1, .8]] },
  { ground: '#bdae93', paint: '#83a598', pieces: [
    ['space', 'rocket_finsA', -.5, 0, -.5, 0, .55, 'rocket'], ['space', 'rocket_baseA', -.5, 0, -.5, 0, .55, 'rocket'], ['space', 'rocket_fuelA', -.5, .88, -.5, 0, .55, 'rocket'],
    ['space', 'rocket_sidesA', -.5, 1.155, -.5, 0, .55, 'rocket'], ['space', 'rocket_topA', -.5, 1.705, -.5, 0, .55, 'rocket'],
    ['space', 'satelliteDish_large', .9, 0, -.7, -.6, 1.1], ['space', 'rock_crystalsLargeA', .8, 0, .9, 0, .9], ['space', 'astronautA', .1, 0, .5, 2.4, .9, 'hop']] },
  { ground: '#689d6a', paint: '#fabd2f', pieces: [
    ['nature', 'tree_pineTallA', -1, 0, -1, 0, 1], ['nature', 'tree_pineRoundC', -.2, 0, -1.2, 0, 1], ['nature', 'tree_oak', 1, 0, -.9, 0, 1],
    ['nature', 'tree_default', -1.1, 0, .6, 0, 1], ['nature', 'tent_smallOpen', .5, 0, -.1, -.5, 1], ['nature', 'campfire_stones', -.1, 0, .6, 0, 1],
    ['nature', 'rock_largeA', 1, 0, 1, .4, .8], ['nature', 'mushroom_redGroup', -.5, 0, 1.2, 0, 1], ['nature', 'flower_yellowA', .3, 0, 1.2, 0, 1]] },
];
const ZL = 32;   // seconds for one zone's whole cycle; the four zones run a quarter apart

async function island({ scene, fx, reduced }) {
  await preload(ISLAND);
  const root = new THREE.Group(); scene.add(root);
  // the island: a faceted glass disc with a rocky glass underside, and a few floating rocks
  const iu = U({ fade: { value: .5 } });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(4.7, 4.5, .4, 12).translate(0, -.2, 0), solid('#8f98ad', iu)); top.renderOrder = -3;
  const under = new THREE.ConeGeometry(4.5, 3.6, 12, 3).rotateX(Math.PI).translate(0, -2.2, 0);
  const pos = under.attributes.position; for (let i = 0; i < pos.count; i++) if (pos.getY(i) > -.45 || pos.getY(i) < -3.95) continue; else pos.setXYZ(i, pos.getX(i) * rnd(.8, 1.15), pos.getY(i) + rnd(-.3, .3), pos.getZ(i) * rnd(.8, 1.15));
  under.computeVertexNormals();
  const rock = new THREE.Mesh(under.toNonIndexed(), solid('#a7b0c4', iu)); rock.geometry.computeVertexNormals(); rock.renderOrder = -4;
  root.add(top, rock);
  const bits = [[5.6, -1.2, -2.5, .35], [-5.6, -2.2, -1, .5], [-1.5, -3.4, -5.6, .3]].map(([x, y, z, s]) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(s, s * 2, 6).rotateX(Math.PI), solid('#a7b0c4', iu)); m.position.set(x, y, z); root.add(m); return { m, y };
  });

  const zones = await Promise.all(ZONES.map(async (z, i) => {
    const a = Math.PI / 4 + i * Math.PI / 2, g = new THREE.Group();
    g.position.set(Math.cos(a) * 2.25, 0, Math.sin(a) * 2.25); g.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); root.add(g);
    const u = U({ paint: { value: new THREE.Color(z.paint) } });
    const ground = new THREE.Mesh(new THREE.BoxGeometry(3.2, .08, 3.2).translate(0, .04, 0), solid(z.ground, u)); ground.renderOrder = -2; g.add(ground);
    const pieces = await Promise.all(z.pieces.map(async ([kit, name, x, y, zz, r, s, act]) => {
      const pu = { ...u, fade: { value: 0 } }, o = await piece(kit, name, pu, s);
      o.position.set(x, y + .08, zz); o.rotation.y = r; g.add(o); return { o, y: y + .08, pu, act };
    }));
    return { g, u, ground, pieces, off: i * ZL / 4 };
  }));

  // one zone's cycle, from its phase: pieces drop in as glass, paint lands, the little world comes alive, paint washes off,
  // pieces lift away
  const T = { drop: .32, hold: 1.6, fly: .7, paint: 1.8, alive: 15, wash: 1.2, lift: .1, rest: 1 };
  const prev = new Map();
  function zoneAt(z, t) {
    const n = z.pieces.length, ph = (t + z.off) % ZL, build = n * T.drop + .6;
    const tFly = build + T.hold, tPaint = tFly + T.fly, tAlive = tPaint + T.paint, tWash = tAlive + T.alive, tLift = tWash + T.wash;
    const p0 = prev.get(z) ?? ph; prev.set(z, ph);
    z.pieces.forEach((p, i) => {
      const inK = (ph - i * T.drop) / .6, outK = (ph - tLift - (n - 1 - i) * T.lift) / .4;
      const k = ph < tLift ? back(inK) : 1 - smooth(outK);
      p.o.position.y = p.y + (1 - k) * 2.4; p.pu.fade.value = ph < tLift ? clamp01(inK * 2) : 1 - smooth(outK);
      let bob = 0;
      if (ph > tAlive && ph < tWash) {
        const lt = ph - tAlive;
        if (p.act === 'hop') bob = Math.abs(Math.sin(lt * 3.2 + i)) * .12;
        if (p.act === 'rocket' && lt > T.alive - 5) bob = (lt - (T.alive - 5)) ** 2.2 * .35;
        if (p.act === 'wave') p.o.rotation.y = Math.sin(lt * 2.5) * .25;
      }
      p.o.position.y += bob;
      if (p.act === 'rocket' && ph > tWash) p.pu.fade.value = 0;
    });
    const R = 3.2;
    z.u.reveal.value = ph < tPaint ? 0 : ph < tAlive ? R * ease((ph - tPaint) / T.paint) : ph < tWash ? R : ph < tLift ? R * (1 - smooth((ph - tWash) / T.wash)) : 0;
    z.ground.material.uniforms.fade.value = ph < tLift + n * T.lift ? 1 : 1 - smooth((ph - tLift - n * T.lift) / .5);
    if (ph < .5) z.ground.material.uniforms.fade.value = smooth(ph / .5);
    // fire the paint when the phase crosses tFly (only while animating)
    if (!reduced && p0 < tFly && ph >= tFly) {
      const hit = z.g.localToWorld(new THREE.Vector3(0, .5, 0));
      const from = hit.clone().add(new THREE.Vector3(rnd(-2, 2), 6.5, rnd(-2, 2)));
      fx.fire(from, hit, z.u.paint.value, T.fly);
    }
    z.g.localToWorld(z.u.hit.value.set(0, .5, 0));   // the paint stays put on the zone as the island turns
  }
  const finished = new Map();   // reduced motion: three zones painted, one still glass
  zones.forEach((z, i) => finished.set(z, i < 3 ? 6 + z.pieces.length * T.drop + T.hold + T.fly + T.paint : z.pieces.length * T.drop + 1.2));
  return {
    update(t, dt) {
      root.position.y = Math.sin(t * .5) * .12; root.rotation.y = t * Math.PI * 2 / 140;
      bits.forEach((b, i) => { b.m.position.y = b.y + Math.sin(t * .7 + i * 2) * .25; b.m.rotation.y = t * .2 * (i + 1); });
      root.updateMatrixWorld();
      for (const z of zones) zoneAt(z, reduced ? finished.get(z) - z.off + ZL : t);
    },
    camera(cam, t, aspect) {
      const portrait = aspect < 1, d = portrait ? 25 : aspect < 1.5 ? 17 : aspect > 2 ? 17 : 15;
      cam.fov = portrait ? 40 : 30; cam.position.set(d * .55, d * .42, d * .84); cam.lookAt(0, portrait ? 1.4 : .9, 0);
    },
  };
}

// ---------------- engine ----------------
export async function start({ el, v, reduced, active, cue }) {
  const phone = matchMedia('(pointer: coarse)').matches, manual = new URLSearchParams(location.search).has('manual');
  const renderer = new THREE.WebGLRenderer({ antialias: !phone, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, phone ? 1.5 : 1.75)); renderer.setClearColor(0, 0);
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, .1, 120);
  scene.userData.camera = camera;
  const fx = paintFX(scene, cue);
  const world = await (v === 'b' ? island : city)({ scene, fx, reduced });
  let t = 0, last = 0, running = false, aspect = 1, frames = 0, cpu = 0;
  function size() {
    const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight; aspect = w / h;
    renderer.setSize(w, h, false); camera.aspect = aspect;
  }
  function draw(dt) {
    world.update(t, dt); fx.update(dt);
    world.camera(camera, t, aspect); camera.updateProjectionMatrix();
    const a = performance.now(); renderer.render(scene, camera); cpu += performance.now() - a; frames++;
  }
  function tick(now) {
    if (!active()) { running = false; return; }
    requestAnimationFrame(tick);
    const dt = (now - last) / 1000;
    if (phone && dt < 1 / 34) return;   // about 30 fps on phones
    last = now; t += Math.min(dt, .1); draw(Math.min(dt, .1));
  }
  function wake() {
    if (reduced || manual) { if (active()) draw(0); return; }
    if (!running && active()) { running = true; last = performance.now(); requestAnimationFrame(tick); }
  }
  new ResizeObserver(() => { size(); if (!running) draw(0); }).observe(el);
  document.addEventListener('visibilitychange', wake);
  size(); draw(0); el.classList.add('on'); wake();
  // for screenshots and timing: step the animation by hand (?manual) and read draw calls and CPU render time
  window.__title = { step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) { t += dt; draw(dt); } },
    info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, cpuMs: +(cpu / frames).toFixed(2), frames, dpr: renderer.getPixelRatio() }) };
  return { wake };
}
