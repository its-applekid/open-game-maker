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

export const PER = 96;
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
  seg(34, 38, 'move', pts.c, pts.back, 'Walk');
  seg(38, 50, 'move', pts.back, pts.away, 'Walk');
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
  for (let t = 0; t < 50; t += .1) {
    const p = posAt(t);
    for (const d of D) {
      if (d.kind !== 'house' || d.shoved) continue;
      if (Math.hypot(d.x - p.x, d.z - p.z) < BODY + d.r + .5) { d.shoved = t; events.push({ t: Math.max(0, t - .25), f: () => hit(d, Math.max(0, t - .25), { top: d.h * .08, dir: [Math.sin(p.yaw), Math.cos(p.yaw)], power: 1.1 }) }); }
    }
  }
  events.sort((a, b) => a.t - b.t).forEach(e => e.f());
  // splashes while he wades, and fires in the worst-hit houses
  for (let t = 0; t < 50; t += .45) { const p = posAt(t); if (ground(p.x, p.z) < 0) fx.splash(t, [p.x + rr(-1.5, 1.5), p.z + rr(-1.5, 1.5)], 1.2); }
  const wrecked = D.filter(d => d.hits.length).sort((a, b) => Math.hypot(a.x - bx, a.z - bz) - Math.hypot(b.x - bx, b.z - bz));
  wrecked.forEach((d, i) => { d.rebuild = d.kind === 'wall' ? 58 : 56 + i * (30 / Math.max(1, wrecked.length)); });
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
      M.g.visible = lt < 50;
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
      fx.update(lt);
    },
    // a camera from over the bay, three-quarter on the breach, shaking with each blow
    camera(cam, t, aspect) {
      const lt = ((t % PER) + PER) % PER, f = P(7, -3);
      let sh = 0; for (const s of SHAKES) { const a = lt - s.t; if (a >= 0 && a < 1.2) sh += s.a * Math.exp(-a * 4); }
      cam.fov = aspect < 1 ? 62 : 44;
      cam.position.set(f[0] - nx * 40 + sx * 40 + Math.sin(lt * 37) * sh, PLAIN + 30 + Math.sin(lt * 53) * sh, f[1] - nz * 40 + sz * 40 + Math.cos(lt * 41) * sh);
      cam.lookAt(f[0], PLAIN + 5, f[1]); cam.aspect = aspect; cam.updateProjectionMatrix();
    },
  };
}
