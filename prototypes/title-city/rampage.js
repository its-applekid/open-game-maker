// The kaiju scene, after the arcade monster-rampage games: the Dino (Quaternius Ultimate Monsters, CC0) wades in from the
// bay, punches through the town wall, and wrecks the harbour quarter: punches, a stomp, a charge. Every blow breaks real
// pieces off the buildings (their own geometry, split at a jagged line), which fly, tumble, bounce and settle as rubble;
// anything his body would pass through breaks just before he reaches it, so nothing clips. Dust, flashes, grit, sparks,
// shock rings, cracks and fires come from fx.js. Then he wades back out and crews rebuild the wall and every house inside
// layered scaffolding. Everything is planned at setup and drawn from the loop time alone (capture mode is exact).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FX, reseed } from './fx.js';

export const PER = 104;
const LEAVE = 58;   // when he is gone
const clamp01 = x => Math.min(1, Math.max(0, x)), smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const ease = x => 1 - (1 - clamp01(x)) ** 3, lerp = (a, b, k) => a + (b - a) * k;
let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296), rr = (a, b) => a + rnd() * (b - a);
const hashN = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

// ---------------- fracture ----------------
// split a non-indexed geometry (in building space, metres) into what stays and chunks of what breaks off; `breaks(cx, cy, cz)`
// decides per triangle by its centre; chunks are the broken triangles grouped by `cell`, each recentred on its own middle
function fracture(geo, breaks, cell = 1.5) {
  const P = geo.attributes.position, N = geo.attributes.normal, UV = geo.attributes.uv, keep = { p: [], n: [], u: [] }, groups = new Map();
  for (let t = 0; t < P.count; t += 3) {
    const cx = (P.getX(t) + P.getX(t + 1) + P.getX(t + 2)) / 3, cy = (P.getY(t) + P.getY(t + 1) + P.getY(t + 2)) / 3, cz = (P.getZ(t) + P.getZ(t + 1) + P.getZ(t + 2)) / 3;
    let dst = keep;
    if (breaks(cx, cy, cz)) { const k = `${Math.floor(cx / cell)},${Math.floor(cy / cell)},${Math.floor(cz / cell)}`; if (!groups.has(k)) groups.set(k, { p: [], n: [], u: [] }); dst = groups.get(k); }
    for (let i = t; i < t + 3; i++) { dst.p.push(P.getX(i), P.getY(i), P.getZ(i)); dst.n.push(N.getX(i), N.getY(i), N.getZ(i)); if (UV) dst.u.push(UV.getX(i), UV.getY(i)); }
  }
  const mk = (d, c = [0, 0, 0]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(d.p.map((v, i) => v - c[i % 3]), 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(d.n, 3)); if (d.u.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(d.u, 2)); return g; };
  const chunks = [];
  for (const d of groups.values()) { const n = d.p.length / 3, c = [0, 0, 0]; for (let i = 0; i < d.p.length; i++) c[i % 3] += d.p[i] / n; let r = 0; for (let i = 0; i < d.p.length; i += 3) r = Math.max(r, Math.hypot(d.p[i] - c[0], d.p[i + 1] - c[1], d.p[i + 2] - c[2])); chunks.push({ geo: mk(d, c), c, r, tris: n / 3 }); }
  return { keep: mk(keep), chunks };
}

// a chunk's flight, planned at 30 Hz: gravity, tumbling, bounces on the ground with friction, sinking in water
function flight(p, v, w, r, ground, fx, t0) {
  const frames = [], q = new THREE.Quaternion(), dq = new THREE.Quaternion(), axis = new THREE.Vector3(...w).normalize(), spin = Math.hypot(...w);
  let x = p[0], y = p[1], z = p[2], vx = v[0], vy = v[1], vz = v[2], s = spin, landed = false, wetted = false;
  for (let i = 0; i < 150; i++) {
    for (let k = 0; k < 2; k++) {   // two 1/60 s steps per frame
      const dt = 1 / 60; vy -= 24 * dt; x += vx * dt; y += vy * dt; z += vz * dt;
      const gy = ground(x, z), floor = gy < 0 ? -4 : gy + r * .35;
      if (gy < 0 && y < 0) { if (!wetted) { wetted = true; if (r > .6) fx.splash(t0 + i / 30, [x, z], .6); } vx *= .9; vz *= .9; vy = Math.max(vy, -3); s *= .95; }
      if (y < floor) { y = floor; if (gy >= 0) { if (!landed && r > .9 && vy < -6) fx.dust(t0 + i / 30, [x, y, z], .35); landed = true; vy = -vy * .28; vx *= .55; vz *= .55; s *= .55; if (Math.abs(vy) < 1.2) vy = 0; } else vy = 0; }
      dq.setFromAxisAngle(axis, s * dt); q.premultiply(dq);
    }
    frames.push(x, y, z, q.x, q.y, q.z, q.w);
    if (i > 20 && Math.abs(vx) + Math.abs(vy) + Math.abs(vz) < .2 && s < .2) break;
  }
  return new Float32Array(frames);
}

async function loadMonster(name, height) {
  const g = await new GLTFLoader().loadAsync(`models/monsters/${name}.glb`), root = g.scene;
  root.traverse(o => { if (o.isMesh) { o.frustumCulled = false; const m = o.material; if (m) { m.metalness = 0; m.roughness = 1; m.color?.lerp(new THREE.Color('#fbf1c7'), .1); } } });
  const box = new THREE.Box3().setFromObject(root), s = height / (box.max.y - box.min.y), holder = new THREE.Group();
  root.scale.setScalar(s); root.position.y = -box.min.y * s; holder.add(root);
  const mixer = new THREE.AnimationMixer(root), actions = {};
  for (const clip of g.animations) actions[clip.name.split('|').pop()] = mixer.clipAction(clip);
  return { g: holder, mixer, actions };
}

// ctx: { scene, camera, U, PLAIN, ground(x, z), kenney(path), kitMat(map, o), houses: [{x, z, rot, s, model, roof, h}],
//        wall: { x, z, yaw, L, KW }, breach: [x, z], inward: [x, z], scaffold(w, d, h, n), layers(sc, n), stepped(k, h), steps(h) }
export async function kaiju(ctx) {
  const { scene, PLAIN, ground } = ctx; seed = 7; reseed(11);
  const fx = new FX(scene, ctx.camera, ctx.U);
  const H = 17, BODY = 3.6;   // the Dino's height and body radius
  const M = await loadMonster('dino', H); scene.add(M.g);
  const [bx, bz] = ctx.breach, [nx, nz] = ctx.inward, [sx, sz] = [nz, -nx];
  const P = (a, b) => [bx + nx * a + sx * b, bz + nz * a + sz * b];   // a: metres inward from the wall, b: metres to the side
  // ---- destructibles: the zone's houses and the wall section, each a mesh we can break step by step
  const D = [];
  const addThing = (geo, map, tint, x, z, rot, scale, h, kind) => {
    const g = geo.clone(); g.scale(...scale); g.rotateY(rot);
    const mat = ctx.kitMat(map, { tint: new THREE.Color(tint) }), chunkMat = mat.clone(); chunkMat.side = THREE.DoubleSide; chunkMat.uniforms.cut.value = 9999;
    const whole = new THREE.Mesh(g, mat); whole.position.set(x, PLAIN, z); scene.add(whole);
    const d = { kind, x, z, h, r: kind === 'wall' ? 0 : Math.max(scale[0], scale[2]) * .7, geo: g, mat, chunkMat, whole, versions: [{ t: -1, mesh: whole }], chunks: [], hits: [], rebuild: 0, burns: false };
    D.push(d); return d;
  };
  for (const h of ctx.houses) { const k = await ctx.kenney(h.model); addThing(k.geo, k.map, h.roof, h.x, h.z, h.rot, [h.s, h.s, h.s], k.h * h.s, 'house'); }
  const wk = await ctx.kenney('castle/wall'), W = ctx.wall;
  const wall = addThing(wk.geo, wk.map, '#7d8fb8', W.x, W.z, W.yaw, [W.L, W.KW, W.KW], wk.h * W.KW, 'wall');
  // break part of a thing at time t: `top` is the new height (jagged), `side` limits the break to one face (a punch's corner),
  // `dir` is where the pieces fly, `power` how hard
  const SHAKES = [];
  function hit(d, t, { top = 0, dir = [nx, nz], power = 1, side = null, at = null, span = null }) {
    const cur = d.versions[d.versions.length - 1].geoCur || d.geo, storey = 3.1;
    const breaks = (cx, cy, cz) => {
      if (span) { const along = cx * Math.cos(d.kind === 'wall' ? W.yaw : 0) - cz * Math.sin(d.kind === 'wall' ? W.yaw : 0); return Math.abs(along - span[0]) < span[1] + (hashN(cy, along) - .5) * 1.6; }
      const jag = top + (hashN(Math.round(cx * 1.3), Math.round(cz * 1.3)) - .5) * storey * .9;
      if (cy <= jag) return false;
      if (side) { const pr = cx * side[0] + cz * side[1]; return pr > -.6 + (hashN(cy, pr) - .5); }
      return true;
    };
    const { keep, chunks } = fracture(cur, breaks);
    if (!chunks.length) return;
    const mesh = new THREE.Mesh(keep, d.mat); mesh.position.set(d.x, PLAIN, d.z); mesh.visible = false; scene.add(mesh);
    d.versions.push({ t, mesh, geoCur: keep });
    const hitAt = at || [d.x, PLAIN + top + 2, d.z];
    for (const c of chunks) {
      if (c.tris < 2) continue;
      // a solid core in the piece's own colour, so it reads as a lump of building rather than a shell
      const sz = Math.min(1.7, c.r * 1.1), core = new THREE.BoxGeometry(sz, sz * .8, sz).toNonIndexed(), uv = c.geo.attributes.uv;
      if (uv) { const u = uv.getX(0), w = uv.getY(0), a = new Float32Array(core.attributes.position.count * 2); for (let k = 0; k < a.length; k += 2) { a[k] = u; a[k + 1] = w; } core.setAttribute('uv', new THREE.BufferAttribute(a, 2)); }
      const m = new THREE.Mesh(uv ? mergeGeometries([c.geo, core]) : c.geo, d.chunkMat); m.visible = false; scene.add(m);
      const p = [d.x + c.c[0], PLAIN + c.c[1], d.z + c.c[2]], out = [p[0] - hitAt[0], p[2] - hitAt[2]], ol = Math.hypot(...out) || 1;
      const sp = rr(3, 9) * power, v = [dir[0] * sp * .8 + out[0] / ol * sp * .5 + rr(-2, 2), rr(2, 8) * Math.sqrt(power), dir[1] * sp * .8 + out[1] / ol * sp * .5 + rr(-2, 2)];
      d.chunks.push({ m, t0: t + rr(0, .06), frames: flight(p, v, [rr(-1, 1), rr(-1, 1), rr(-1, 1)].map(x => x * rr(2, 9)), c.r, ground, fx, t) });
    }
    d.hits.push(t); d.brokenTo = top;
    fx.dust(t + .05, [d.x, PLAIN + Math.max(1, top), d.z], d.kind === 'wall' ? 1.2 : .8 + power * .3);
    fx.debris(t, hitAt, dir, .8 + power * .3); fx.flash(t, hitAt, .6 + power * .3);
    SHAKES.push({ t, a: .25 * power });
  }

  // ---- the choreography: where he is and what he does, second by second
  const pts = { sea: P(-75, 6), outside: P(-6, 0), gap: P(9, 0), a: P(16, 7), b: P(24, -5), c: P(14, -13), back: P(-6, -2), away: P(-80, -10) };
  const S = [];   // segments: walk/run between points, or act on the spot (with a facing)
  const seg = (t0, t1, kind, from, to, clip, face) => S.push({ t0, t1, kind, from, to, clip, face });
  seg(0, 10, 'move', pts.sea, pts.outside, 'Walk');
  seg(10, 12.2, 'act', pts.outside, pts.outside, 'Punch', [nx, nz]);                 // through the wall
  seg(12.2, 15, 'move', pts.outside, pts.gap, 'Walk');
  seg(15, 17, 'act', pts.gap, pts.gap, 'Punch', null);                               // a house on the left
  seg(17, 19.5, 'move', pts.gap, pts.a, 'Walk');
  seg(19.5, 21.5, 'act', pts.a, pts.a, 'Punch', null);                               // a house on the right
  seg(21.5, 23, 'move', pts.a, pts.b, 'Run');                                        // charge
  seg(23, 24.2, 'act', pts.b, pts.b, 'Jump', null);                                  // stomp
  seg(24.2, 25.2, 'act', pts.b, pts.b, 'Jump_Land', null);
  seg(25.2, 27.5, 'act', pts.b, pts.b, 'Yes', null);                                 // roar
  seg(27.5, 29.5, 'act', pts.b, pts.b, 'Punch', null);
  seg(29.5, 32, 'move', pts.b, pts.c, 'Walk');
  seg(32, 34, 'act', pts.c, pts.c, 'Punch', null);
  // the castle fights back (see DEFENCE below): hits at 36.4, 38.3 (bolt) and 40.2 make him reel; he roars and flees
  seg(34, 36.4, 'act', pts.c, pts.c, 'Yes', null);
  seg(36.4, 37.4, 'act', pts.c, pts.c, 'HitReact', null);
  seg(37.4, 38.3, 'act', pts.c, pts.c, 'Idle', null);
  seg(38.3, 39.3, 'act', pts.c, pts.c, 'HitReact', null);
  seg(39.3, 40.2, 'act', pts.c, pts.c, 'Idle', null);
  seg(40.2, 41.2, 'act', pts.c, pts.c, 'HitReact', null);
  seg(41.2, 42.6, 'act', pts.c, pts.c, 'No', null);
  seg(42.6, 46, 'move', pts.c, pts.back, 'Run');
  seg(46, LEAVE, 'move', pts.back, pts.away, 'Walk');
  const posAt = t => {   // position and heading at time t
    const s = S.find(s => t >= s.t0 && t < s.t1) || S[S.length - 1], k = clamp01((t - s.t0) / (s.t1 - s.t0));
    const x = lerp(s.from[0], s.to[0], k), z = lerp(s.from[1], s.to[1], k), yaw = s.kind === 'move' ? Math.atan2(s.to[0] - s.from[0], s.to[1] - s.from[1]) : s.yaw ?? 0;
    return { s, k, x, z, yaw };
  };
  // facings for punches: the nearest unbroken-enough house in front; stomp hits everything around
  const nearest = (p, exclude = []) => D.filter(d => d.kind === 'house' && !exclude.includes(d)).sort((a, b) => Math.hypot(a.x - p[0], a.z - p[1]) - Math.hypot(b.x - p[0], b.z - p[1]))[0];
  const punched = [];
  for (const s of S) {
    if (s.kind === 'move') continue;
    const prev = S[S.indexOf(s) - 1], fallbackYaw = prev ? (prev.kind === 'move' ? Math.atan2(prev.to[0] - prev.from[0], prev.to[1] - prev.from[1]) : prev.yaw) : 0;
    if (s.face) s.yaw = Math.atan2(s.face[0], s.face[1]);
    else if (s.clip === 'Punch') { const d = nearest(s.from, punched); punched.push(d); s.target = d; s.yaw = Math.atan2(d.x - s.from[0], d.z - s.from[1]); }
    else s.yaw = fallbackYaw;
  }
  // ---- impacts, in time order (so each break works on what the last one left)
  const events = [];
  for (const s of S) {
    if (s.clip === 'Punch' && s.face) events.push({ t: s.t0 + .9, f: () => { hit(wall, s.t0 + .9, { span: [0, 4.5], dir: [nx, nz], power: 1.4, at: [W.x, PLAIN + 3, W.z] }); fx.ring(s.t0 + .9, [W.x, PLAIN, W.z], .8); } });
    else if (s.clip === 'Punch') events.push({ t: s.t0 + .8, f: () => { const d = s.target, dir = [Math.sin(s.yaw), Math.cos(s.yaw)]; hit(d, s.t0 + .8, { top: d.h * rr(.25, .45), dir, power: 1.2, side: [-dir[0], -dir[1]], at: [d.x - dir[0] * d.r, PLAIN + d.h * .6, d.z - dir[1] * d.r] });
      for (const o of D) if (o !== d && o.kind === 'house' && Math.hypot(o.x - d.x, o.z - d.z) < 6) hit(o, s.t0 + .95, { top: o.h * rr(.6, .8), dir, power: .6 }); } });
    else if (s.clip === 'Jump_Land') events.push({ t: s.t0 + .1, f: () => { const [x, z] = s.from, t = s.t0 + .1;
      fx.ring(t, [x, PLAIN, z], 1.6); fx.decal(t, 60, 'crack', [x, PLAIN, z], 14); fx.dust(t, [x, PLAIN, z], 1.6); SHAKES.push({ t, a: .7 });
      for (const o of D) { if (o.kind !== 'house') continue; const dd = Math.hypot(o.x - x, o.z - z); if (dd > 14) continue;
        const away = [(o.x - x) / (dd || 1), (o.z - z) / (dd || 1)];
        hit(o, t + dd * .02, { top: dd < 6.5 ? o.h * .12 : o.h * lerp(.5, .8, (dd - 6.5) / 7.5), dir: away, power: dd < 6.5 ? 1.5 : .8 }); } } });
  }
  // shove: anything the body would touch breaks just before contact, pushed the way he is going
  for (let t = 0; t < LEAVE; t += .1) {
    const p = posAt(t);
    for (const d of D) {
      if (d.kind !== 'house' || d.shoved) continue;
      if (Math.hypot(d.x - p.x, d.z - p.z) < BODY + d.r + .5) { d.shoved = t; events.push({ t: Math.max(0, t - .25), f: () => hit(d, Math.max(0, t - .25), { top: d.h * .08, dir: [Math.sin(p.yaw), Math.cos(p.yaw)], power: 1.1 }) }); }
    }
  }
  events.sort((a, b) => a.t - b.t).forEach(e => e.f());
  // ---- the castle fights back: two trebuchets on the castle hill and a ballista on the near wall (Kenney Castle Kit)
  const engines = [];
  const engine = async (model, x, z, y, s) => {   // kept as a node tree so the trebuchet's arm can swing and the ballista's bolt can fly
    const k = await ctx.kenneyScene(model), o = k.scene; o.scale.setScalar(s); o.position.set(x, y, z); scene.add(o);
    const e = { o, x, z, y, s, arm: o.getObjectByName('arm'), arrow: o.getObjectByName('arrow'), shots: [] }; engines.push(e); return e;
  };
  const C = ctx.castle, cf = [Math.sin(C.face), Math.cos(C.face)], cs = [cf[1], -cf[0]];
  const tre1 = await engine('castle/siege-trebuchet', C.x + cf[0] * (C.r + 6) + cs[0] * 9, C.z + cf[1] * (C.r + 6) + cs[1] * 9, ground(C.x + cf[0] * (C.r + 6), C.z + cf[1] * (C.r + 6)), 4.5);
  const tre2 = await engine('castle/siege-trebuchet', C.x + cf[0] * (C.r + 6) - cs[0] * 9, C.z + cf[1] * (C.r + 6) - cs[1] * 9, ground(C.x + cf[0] * (C.r + 6), C.z + cf[1] * (C.r + 6)), 4.5);
  const bal = await engine('castle/siege-ballista', ...P(8, 22), PLAIN, 3.6);
  const fieldFrom = P(-34, 30), fieldTo = P(-15, 24);   // pushed across the fields outside the wall, then turned to face him
  const field = await engine('castle/siege-trebuchet', ...fieldTo, ground(...fieldTo), 4.2);
  for (const e of engines) e.o.rotation.y = Math.atan2(pts.c[0] - e.x, pts.c[1] - e.z) + Math.PI;
  field.move = { t0: 26, t1: 33, from: fieldFrom, to: fieldTo, turn0: 33, turn1: 35, yaw0: Math.atan2(fieldTo[0] - fieldFrom[0], fieldTo[1] - fieldFrom[1]) + Math.PI, yaw1: field.o.rotation.y };
  const chest = (t) => { const p = posAt(t); return [p.x, Math.max(ground(p.x, p.z), 0) + H * .6, p.z]; };
  const missHouse = D.filter(d => d.kind === 'house' && !d.hits.length).sort((a, b) => Math.hypot(a.x - pts.c[0], a.z - pts.c[1]) - Math.hypot(b.x - pts.c[0], b.z - pts.c[1]))[0];
  const DEFENCE = [   // fire time, engine, what it hits, flight seconds (hits at 36.4, 38.3 and 40.2 make him reel)
    { t: 33.0, e: tre1, hit: 'dino', fl: 3.4 }, { t: 34.4, e: tre2, hit: 'house', fl: 3.0 }, { t: 36.6, e: field, hit: 'dino', fl: 1.7 },
    { t: 37.0, e: tre2, hit: 'dino', fl: 3.2 }, { t: 39.0, e: bal, hit: 'dino', fl: 1.0, bolt: true }, { t: 39.0, e: tre1, hit: 'none', fl: 3.6 },
  ];
  const shots = [];
  for (const s of DEFENCE) {
    const land = s.t + s.fl, from = [s.e.x, s.e.y + s.e.s * (s.bolt ? .6 : 1.6), s.e.z];
    const to = s.hit === 'dino' ? chest(land) : s.hit === 'house' && missHouse ? [missHouse.x, PLAIN + missHouse.h * .7, missHouse.z] : (() => { const p = P(20, 10); return [p[0], ground(...p), p[1]]; })();
    const mesh = s.bolt ? new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 4, 5).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#6b5d55' }))
      : new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), new THREE.MeshLambertMaterial({ color: '#8d8682', flatShading: true }));
    mesh.visible = false; scene.add(mesh); s.e.shots.push(s.t);
    const shot = { ...s, from, to, land, mesh, arc: s.bolt ? 2 : Math.hypot(to[0] - from[0], to[2] - from[2]) * .35 };
    shots.push(shot);
    if (!s.bolt) for (let k = 0; k < s.fl * 14; k++) {   // the boulder burns as it flies: a flame and smoke trail
      const u = k / (s.fl * 14), q = [lerp(from[0], to[0], u), lerp(from[1], to[1], u) + Math.sin(u * Math.PI) * shot.arc, lerp(from[2], to[2], u)];
      fx.add('flame', { born: s.t + u * s.fl, life: .5, p: q, v: [0, 1, 0], size: 2.2, grow: -.8, rot: rr(0, 6), color: '#ffb067', alpha: 1 });
      if (k % 2 === 0) fx.add('smoke', { born: s.t + u * s.fl, life: 2.2, p: q, v: [0, 1.5, 0], drag: .5, size: 1.4, grow: .8, rot: rr(0, 6), color: '#b8aeb6', alpha: .35 });
    }
    // the impact
    fx.flash(land, to, s.bolt ? .8 : 1.4); SHAKES.push({ t: land, a: s.bolt ? .2 : .45 });
    if (s.hit === 'dino') { fx.dust(land, to, .5, '#d9c9b8'); if (!s.bolt) fx.fire(land, land + 1.2, to, .9); }
    else if (s.hit === 'house' && missHouse) { hit(missHouse, land, { top: missHouse.h * .2, dir: [to[0] - from[0], to[2] - from[2]].map(v => v / Math.hypot(to[0] - from[0], to[2] - from[2])), power: 1.5, at: to }); }
    else { fx.dust(land, to, .9); fx.debris(land, to, [0, 0], 1); fx.ring(land, to, .5); }
  }

  // ---- the soldiers (Kenney Mini Dungeon humans, same family as the Castle Kit): crews push and cheer, archers shoot from the
  // wall, spearmen charge his feet and stab, then cheer and chase him off
  const hk = await ctx.kenneyScene('minidungeon/character-human'), spear = await ctx.kenneyScene('minidungeon/weapon-spear');
  const hb = new THREE.Box3().setFromObject(hk.scene), HS = 2.7 / (hb.max.y - hb.min.y);   // a bit larger than life, so they read next to the monster
  const men = [];
  const man = (plan, armed) => {   // plan: [[t, x, z, clip, yawTarget?], ...] — position eases between keys
    const o = hk.scene.clone(); o.scale.setScalar(HS); scene.add(o);
    if (armed) { const s = spear.scene.clone(); s.scale.setScalar(1); s.rotation.z = -.3; (o.getObjectByName('arm-right') || o).add(s); s.position.set(-.1, -.25, .1); }
    const mixer = new THREE.AnimationMixer(o), acts = {}; for (const c of hk.animations) acts[c.name] = mixer.clipAction(c);
    const m = { o, mixer, acts, plan, cur: null }; men.push(m); return m;
  };
  const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
  // crews: three at each engine (the field crew walks it across the fields)
  for (const e of engines) for (let i = 0; i < 3; i++) {
    const off = (x, z, r, a) => [x + Math.cos(a) * r, z + Math.sin(a) * r], a0 = e.o.rotation.y + Math.PI / 2 + (i - 1) * .7;
    if (e === field) { const st = off(fieldFrom[0], fieldFrom[1], 3.2, a0), en = off(fieldTo[0], fieldTo[1], 3.2, a0);
      man([[0, ...st, 'idle'], [26, ...st, 'interact-right'], [33, ...en, 'interact-right'], [35, ...en, 'idle'], [36.6, ...en, 'emote-yes'], [38.5, ...en, 'idle'], [LEAVE, ...en, 'emote-yes']]); }
    else { const p = off(e.x, e.z, 3, a0); man([[0, p[0], p[1], 'idle'], [e.shots[0] - .4, p[0], p[1], 'interact-right'], [e.shots[0] + .3, p[0], p[1], 'emote-yes'], [e.shots[0] + 2, p[0], p[1], 'idle'], [LEAVE - 12, p[0], p[1], 'emote-yes']]); }
  }
  // archers on the wall either side of the breach
  const arrows = [];
  for (let i = 0; i < 4; i++) { const p = [W.x + Math.cos(W.yaw) * (i < 2 ? -9 - i * 2.5 : 9 + (i - 2) * 2.5), W.z - Math.sin(W.yaw) * (i < 2 ? -9 - i * 2.5 : 9 + (i - 2) * 2.5)];
    const m = man([[0, p[0], p[1], 'idle'], [34, p[0], p[1], 'holding-both-shoot'], [42, p[0], p[1], 'emote-yes'], [LEAVE, p[0], p[1], 'idle']]); m.y = PLAIN + W.KW * 1.25;
    for (let k = 0; k < 6; k++) { const tf = 34.3 + k * 1.2 + i * .25; arrows.push({ t: tf, from: [p[0], m.y + 1.4, p[1]], fl: .8 }); } }
  // spearmen: out of the streets, at his feet, stabbing; they scatter when he reels, then cheer and give chase
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, home = P(30 + (i % 3) * 3, -12 + i * 3), ring = [pts.c[0] + Math.cos(a) * 6.5, pts.c[1] + Math.sin(a) * 6.5], back = [pts.c[0] + Math.cos(a) * 11, pts.c[1] + Math.sin(a) * 11];
    man([[0, ...home, 'idle'], [33 + i * .15, ...home, 'sprint'], [35.6, ...ring, 'attack-melee-right'], [40.2, ...ring, 'sprint'], [41.2, ...back, 'emote-yes'], [42.8, ...back, 'sprint'], [46, ...P(-2, -2 + (i - 4) * 1.5), 'emote-yes'], [LEAVE, ...P(-2, -2 + (i - 4) * 1.5), 'idle']], true);
  }
  const arrowMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.04, .04, 1.4, 4).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#5e4a44' }), arrows.length);
  arrowMesh.frustumCulled = false; scene.add(arrowMesh);
  for (const ar of arrows) ar.to = chest(ar.t + ar.fl);

  // splashes while he wades, and fires in the worst-hit houses
  for (let t = 0; t < LEAVE; t += .45) { const p = posAt(t); if (ground(p.x, p.z) < 0) fx.splash(t, [p.x + rr(-1.5, 1.5), p.z + rr(-1.5, 1.5)], 1.2); }
  const wrecked = D.filter(d => d.hits.length).sort((a, b) => Math.hypot(a.x - bx, a.z - bz) - Math.hypot(b.x - bx, b.z - bz));
  wrecked.forEach((d, i) => { d.rebuild = d.kind === 'wall' ? LEAVE + 4 : LEAVE + 2 + i * (32 / Math.max(1, wrecked.length)); });
  wrecked.filter(d => d.kind === 'house' && d.brokenTo < d.h * .5).slice(0, 5).forEach((d, i) => {
    d.burns = true; const t0 = d.hits[0] + 1 + i * .7; fx.fire(t0, d.rebuild - 2, [d.x, PLAIN + Math.max(.5, d.brokenTo), d.z], 1.7); fx.decal(t0, d.rebuild + 9, 'scorch', [d.x, PLAIN, d.z], 7);
  });
  for (const d of wrecked) { d.sc = ctx.scaffold(d.kind === 'wall' ? 10 : d.r * 1.6 + .9, d.kind === 'wall' ? 3 : d.r * 1.6 + .9, d.h + .8, ctx.steps(d.h)); d.sc.position.set(d.x, PLAIN, d.z); d.sc.rotation.y = d.kind === 'wall' ? W.yaw : 0; scene.add(d.sc); }
  fx.build();

  let current = null;
  return {
    update(t) {
      const lt = ((t % PER) + PER) % PER;
      // the monster
      M.g.visible = lt < LEAVE;
      if (M.g.visible) {
        const p = posAt(lt), a = M.actions[p.s.clip] || M.actions.Walk;
        M.g.position.set(p.x, Math.max(ground(p.x, p.z), -5), p.z); M.g.rotation.y = p.yaw;
        if (current !== a) { M.mixer.stopAllAction(); a.reset().play(); current = a; }
        a.time = (p.s.kind === 'act' ? lt - p.s.t0 : lt) % a.getClip().duration; M.mixer.update(0);
      }
      // the destructibles: show the version for this moment, fly the chunks, sink rubble, rebuild in scaffolding
      for (const d of D) {
        let v = d.versions[0]; for (const x of d.versions) if (x.t <= lt) v = x;
        const rebuilding = d.rebuild && lt >= d.rebuild, built = d.rebuild && lt >= d.rebuild + 9 + 4;
        for (const x of d.versions) x.mesh.visible = false;
        if (!d.rebuild || lt < d.rebuild) v.mesh.visible = true;
        d.mat.uniforms.cut.value = 9999;
        if (rebuilding) { d.whole.visible = true; const k = (lt - d.rebuild) / 9, n = ctx.steps(d.h);
          if (k < 1) { d.mat.uniforms.cut.value = PLAIN + d.h * ctx.stepped(k, d.h); ctx.layers(d.sc, Math.min(n, k * n + .55) + .45); }
          else ctx.layers(d.sc, built ? 0 : n - (lt - d.rebuild - 9) / .4); }
        else if (d.sc) ctx.layers(d.sc, 0);
        for (const c of d.chunks) {
          const a = lt - c.t0, sink = d.rebuild ? clamp01((lt - (d.rebuild - 2)) / 2) : 0;
          c.m.visible = a >= 0 && sink < 1; if (!c.m.visible) continue;
          const i = Math.min(c.frames.length / 7 - 1, Math.floor(a * 30)) * 7, f = c.frames;
          c.m.position.set(f[i], f[i + 1] - sink * 2, f[i + 2]); c.m.quaternion.set(f[i + 3], f[i + 4], f[i + 5], f[i + 6]);
        }
      }
      if (field.move) { const mv = field.move, k = smooth((lt - mv.t0) / (mv.t1 - mv.t0)), kt = smooth((lt - mv.turn0) / (mv.turn1 - mv.turn0));
        field.o.position.set(lerp(mv.from[0], mv.to[0], k), ground(lerp(mv.from[0], mv.to[0], k), lerp(mv.from[1], mv.to[1], k)), lerp(mv.from[1], mv.to[1], k));
        field.o.rotation.y = lerp(mv.yaw0, mv.yaw1, kt); field.x = field.o.position.x; field.z = field.o.position.z;
        field.o.traverse(n => { if (n.name === 'wheel') n.rotation.x = -k * 12; }); }
      for (const m of men) {
        let i = 0; while (i < m.plan.length - 1 && m.plan[i + 1][0] <= lt) i++;
        const a = m.plan[i], b = m.plan[Math.min(i + 1, m.plan.length - 1)], k = b[0] > a[0] ? clamp01((lt - a[0]) / (b[0] - a[0])) : 0, moving = a[1] !== b[1] || a[2] !== b[2];
        const x = lerp(a[1], b[1], moving ? k : 0), z = lerp(a[2], b[2], moving ? k : 0);
        m.o.visible = lt < LEAVE + 4; m.o.position.set(x, m.y ?? Math.max(PLAIN, ground(x, z)), z);
        const tgt = M.g.visible ? M.g.position : { x: pts.away[0], z: pts.away[1] };
        m.o.rotation.y = moving && k < 1 ? Math.atan2(b[1] - a[1], b[2] - a[2]) : a[3] === 'interact-right' ? m.o.rotation.y : Math.atan2(tgt.x - x, tgt.z - z);
        const act = m.acts[moving && k < 1 && a[3] === 'idle' ? 'walk' : a[3]] || m.acts.idle;
        if (m.cur !== act) { m.mixer.stopAllAction(); act.reset().play(); m.cur = act; }
        act.time = (lt - a[0]) % act.getClip().duration; m.mixer.update(0);
      }
      { const o = new THREE.Object3D(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
        arrows.forEach((ar, i) => { const k = (lt - ar.t) / ar.fl; if (k < 0 || k > 1) { arrowMesh.setMatrixAt(i, zero); return; }
          const x = lerp(ar.from[0], ar.to[0], k), y = lerp(ar.from[1], ar.to[1], k) + Math.sin(k * Math.PI) * 3, z = lerp(ar.from[2], ar.to[2], k);
          o.position.set(x, y, z); o.lookAt(ar.to[0], ar.to[1], ar.to[2]); o.updateMatrix(); arrowMesh.setMatrixAt(i, o.matrix); });
        arrowMesh.instanceMatrix.needsUpdate = true; }
      for (const e of engines) {   // the trebuchet's arm swings through each throw; the ballista's bolt is gone once fired
        const since = Math.min(...e.shots.map(s => lt - s).filter(a => a >= 0), 99);
        if (e.arm) e.arm.rotation.x = since < 1.2 ? -Math.sin(Math.min(1, since / .35) * Math.PI / 2) * 1.6 * (1 - smooth((since - .5) / .7)) : 0;
        if (e.arrow) e.arrow.visible = since > 4 || since === 99;
      }
      for (const s of shots) {
        const k = (lt - s.t) / s.fl; s.mesh.visible = k >= 0 && (s.bolt ? k < 1 + 2.5 / s.fl : k < 1);
        if (!s.mesh.visible) continue;
        const u = Math.min(1, k), x = lerp(s.from[0], s.to[0], u), y = lerp(s.from[1], s.to[1], u) + Math.sin(u * Math.PI) * s.arc, z = lerp(s.from[2], s.to[2], u);
        if (s.bolt && k >= 1 && s.hit === 'dino') { const c = chest(lt); s.mesh.position.set(c[0], c[1], c[2]); }   // the bolt sticks in him
        else s.mesh.position.set(x, y, z);
        s.mesh.lookAt(s.to[0], s.to[1], s.to[2]); s.mesh.rotation.z += lt * 4 * (s.bolt ? 0 : 1);
      }
      fx.update(lt);
    },
    // a camera from over the bay, three-quarter on the breach, shaking with each blow
    camera(cam, t, aspect) {
      const lt = ((t % PER) + PER) % PER, f = P(7, -3);
      let sh = 0; for (const s of SHAKES) { const a = lt - s.t; if (a >= 0 && a < 1.2) sh += s.a * Math.exp(-a * 4); }
      if (lt >= 29.5 && lt < 45.5) {   // during the defence: from behind the field trebuchet, the Dino and the soldiers at his feet
        const to = [pts.c[0] - field.x, pts.c[1] - field.z], l = Math.hypot(...to), d = [to[0] / l, to[1] / l], sd = [d[1], -d[0]];
        cam.fov = aspect < 1 ? 64 : 46;
        cam.position.set(field.x - d[0] * 12 + sd[0] * 8 + Math.sin(lt * 37) * sh, ground(field.x, field.z) + 21 + Math.sin(lt * 53) * sh, field.z - d[1] * 12 + sd[1] * 8 + Math.cos(lt * 41) * sh);
        cam.lookAt(lerp(field.x, pts.c[0], .7), PLAIN + 4, lerp(field.z, pts.c[1], .7)); cam.aspect = aspect; cam.updateProjectionMatrix(); return;
      }
      cam.fov = aspect < 1 ? 62 : 44;
      cam.position.set(f[0] - nx * 40 + sx * 40 + Math.sin(lt * 37) * sh, PLAIN + 30 + Math.sin(lt * 53) * sh, f[1] - nz * 40 + sz * 40 + Math.cos(lt * 41) * sh);
      cam.lookAt(f[0], PLAIN + 5, f[1]); cam.aspect = aspect; cam.updateProjectionMatrix();
    },
  };
}
