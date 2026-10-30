// A scene in the title town, after the arcade monster-rampage games: a giant monster comes into town, climbs a tall house,
// punches its windows out, the house crumbles, the monster jumps down and leaves, and the house is rebuilt inside wooden
// scaffolding. The monsters come from Quaternius Ultimate Monsters (CC0, assets-local/packs/quaternius-ultimate-monsters)
// with their own animations: a: the Yeti up the south road; b: the Dino wading in from the bay; c: the Blue Demon in on
// the west road. Runs on its own loop (PER seconds).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const PER = 52;
export const MONSTERS = { a: 'yeti', b: 'dino', c: 'blue-demon' };
const clamp01 = x => Math.min(1, Math.max(0, x)), smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const ease = x => 1 - (1 - clamp01(x)) ** 3, lerp = (a, b, k) => a + (b - a) * k;
const T = { walkIn: 0, climb: 9, punch: 12.5, crumble: 18, jump: 18.5, leave: 20.5, gone: 30, build: 31, built: 43 };   // seconds into the loop
// which clip plays in each part of the scene (the pack's monsters share these names)
const CLIP = { walk: 'Walk', climb: 'Jump_Idle', punch: 'Punch', roar: 'Yes', jump: 'Jump', land: 'Jump_Land' };

async function monster(name, height) {
  const g = await new GLTFLoader().loadAsync(`models/monsters/${name}.glb`), root = g.scene;
  root.traverse(o => { if (o.isMesh) { o.frustumCulled = false; const m = o.material; if (m) { m.metalness = 0; m.roughness = 1; m.color?.lerp(new THREE.Color('#fbf1c7'), .1); } } });   // matte, a touch lighter, toward the town's pastels
  const box = new THREE.Box3().setFromObject(root), s = height / (box.max.y - box.min.y);
  const holder = new THREE.Group(); root.scale.setScalar(s); root.position.y = -box.min.y * s; holder.add(root);
  const mixer = new THREE.AnimationMixer(root), actions = {};
  for (const clip of g.animations) actions[clip.name.split('|').pop()] = mixer.clipAction(clip);
  return { g: holder, mixer, actions };
}

// ctx: { scene, camera, target: { x, z, rot, h, w, d, mesh, cut }, path: [[x, z], ...] (where the monster appears, to the
// foot of the house), exit (the way out), ground(x, z), scaffold(w, d, h, n), layers(sc, count), stepped(k, h), steps(h) }
export async function rampage(ctx, v) {
  const { scene, target: tg } = ctx;
  const front = [Math.sin(tg.rot), Math.cos(tg.rot)];   // the house's front faces the street
  const M = await monster(MONSTERS[v] || 'yeti', tg.h * 1.15); scene.add(M.g);
  const reach = 2.2;   // how far in front of the wall the monster stands when it climbs
  const climbAt = [tg.x + front[0] * (tg.w / 2 + reach), tg.z + front[1] * (tg.w / 2 + reach)];
  // debris: chunks of the house's colours thrown out of each punch and the collapse
  const chunkGeo = new THREE.BoxGeometry(1, 1, 1), chunks = [];
  for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(chunkGeo, new THREE.MeshLambertMaterial({ color: ['#f2e5bc', '#d9c2a8', '#c9806a', '#7d8fb8'][i % 4], flatShading: true })); m.visible = false; scene.add(m); chunks.push({ m, seed: i }); }
  const holes = [];   // dark punched-out windows on the house front
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, .2), new THREE.MeshBasicMaterial({ color: '#2b2522' })); m.visible = false; scene.add(m); holes.push(m); }
  const dust = []; for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#efe4d6', transparent: true, flatShading: true })); m.visible = false; scene.add(m); dust.push({ m, a: i / 14 * Math.PI * 2, r: .6 + (i * .37) % .5 }); }
  const sc = ctx.scaffold(tg.w + .9, tg.d + .9, tg.h + .8, ctx.steps(tg.h)); sc.position.set(tg.x, ctx.PLAIN, tg.z); sc.rotation.y = tg.rot; scene.add(sc);
  const along = (pts, k) => {   // point and heading at fraction k along a polyline
    let L = 0; const seg = []; for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(l); L += l; }
    let d = clamp01(k) * L, i = 0; while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
    const a = pts[i], b = pts[i + 1], u = seg[i] ? d / seg[i] : 0; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, Math.atan2(b[0] - a[0], b[1] - a[1])];
  };
  const pathIn = [...ctx.path, climbAt], outAt = [climbAt[0] + front[0] * 9, climbAt[1] + front[1] * 9];
  // pose the monster: one clip at a time, sampled at the clip's own time (deterministic, so capture mode is exact)
  let current = null;
  const place = (x, y, z, yaw, kind, clipT) => {
    M.g.visible = true; M.g.position.set(x, y, z); M.g.rotation.y = yaw;
    const a = M.actions[CLIP[kind]] || M.actions.Idle;
    if (current !== a) { M.mixer.stopAllAction(); a.reset().play(); current = a; }
    a.time = clipT % a.getClip().duration; M.mixer.update(0);
  };
  return {
    update(t) {
      const lt = ((t % PER) + PER) % PER, g = ctx.ground, yaw0 = tg.rot + Math.PI;   // yaw0: facing the house
      // the house: standing, punched, crumbling, gone, rebuilt inside scaffolding layer by layer, scaffold taken down
      tg.mesh.visible = true; tg.mesh.position.set(tg.x, ctx.PLAIN, tg.z); tg.cut.value = 9999; ctx.layers(sc, 0);
      if (lt >= T.crumble && lt < T.crumble + 2.6) { const k = (lt - T.crumble) / 2.6, s = clamp01((k - .1) / .9) ** 2.2; tg.mesh.position.y = ctx.PLAIN - s * tg.h; tg.mesh.position.x = tg.x + Math.sin(lt * 50) * .15 * (1 - s); }
      else if (lt >= T.crumble + 2.6 && lt < T.build) tg.mesh.visible = false;
      else if (lt >= T.build && lt < T.built) { const k = (lt - T.build) / (T.built - T.build), n = ctx.steps(tg.h); tg.cut.value = ctx.PLAIN + tg.h * ctx.stepped(k, tg.h); ctx.layers(sc, Math.min(n, k * n + .55) + .45); }
      else if (lt >= T.built && lt < T.built + 4) { const n = ctx.steps(tg.h); ctx.layers(sc, n - (lt - T.built) / .4); }
      // the monster
      M.g.visible = false;
      const climbY = ctx.PLAIN + tg.h * .28;
      if (lt < T.climb) { const k = (lt - T.walkIn) / (T.climb - T.walkIn), [x, z, yaw] = along(pathIn, k); place(x, g(x, z), z, yaw, 'walk', lt); }
      else if (lt < T.punch) { const k = (lt - T.climb) / (T.punch - T.climb); place(climbAt[0], lerp(g(...climbAt), climbY, ease(k)), climbAt[1], yaw0, 'climb', lt); }
      else if (lt < T.crumble) place(climbAt[0], climbY, climbAt[1], yaw0, 'punch', lt - T.punch);
      else if (lt < T.jump) place(climbAt[0], climbY, climbAt[1], yaw0, 'roar', lt - T.crumble);
      else if (lt < T.leave) { const k = (lt - T.jump) / (T.leave - T.jump); place(lerp(climbAt[0], outAt[0], k), lerp(climbY, g(...outAt), k) + Math.sin(k * Math.PI) * 4, lerp(climbAt[1], outAt[1], k), tg.rot, 'jump', k * .9); }
      else if (lt < T.gone) {
        const k = (lt - T.leave) / (T.gone - T.leave), [x, z, yaw] = along([outAt, ...ctx.exit], Math.max(0, (k - .12) / .88));
        if (k < .12) place(outAt[0], g(...outAt), outAt[1], yaw0, 'roar', lt - T.leave); else place(x, g(x, z), z, yaw, 'walk', lt);
      }
      // punched windows and flying chunks
      holes.forEach((m, i) => { const at = T.punch + (i + .35) * (T.crumble - T.punch) / 4; m.visible = lt > at && lt < T.crumble + 1;
        const sx = (i % 2 ? .25 : -.25) * tg.w, sy = tg.h * (.5 + (i >> 1) * .18), c = Math.cos(tg.rot), s = Math.sin(tg.rot);
        m.position.set(tg.x + front[0] * (tg.w / 2 + .05) + c * sx, ctx.PLAIN + sy, tg.z + front[1] * (tg.w / 2 + .05) - s * sx); m.rotation.y = tg.rot; });
      chunks.forEach(({ m, seed }) => {
        const burst = seed < 24 ? Math.floor(seed / 6) : 4, at = burst < 4 ? T.punch + (burst + .35) * (T.crumble - T.punch) / 4 : T.crumble + .4, dt = lt - at, life = burst < 4 ? 1.4 : 2.2;
        m.visible = dt > 0 && dt < life; if (!m.visible) return;
        const a = seed * 2.4, sp = 3 + (seed % 5), up = 4 + (seed % 3) * 2, bx = tg.x + front[0] * (tg.w / 2 + .5), bz = tg.z + front[1] * (tg.w / 2 + .5), by = ctx.PLAIN + (burst < 4 ? tg.h * (.5 + (burst >> 1) * .18) : tg.h * .3);
        m.position.set(bx + (front[0] * 1.2 + Math.cos(a) * .6) * sp * dt, Math.max(ctx.PLAIN, by + up * dt - 9 * dt * dt), bz + (front[1] * 1.2 + Math.sin(a) * .6) * sp * dt);
        m.rotation.set(dt * 5 + seed, dt * 3, 0); m.scale.setScalar((.45 + (seed % 3) * .15) * (1 - dt / life * .4));
      });
      dust.forEach(q => { const k = (lt - T.crumble - .3) / 3.6; q.m.visible = k > 0 && k < 1; if (!q.m.visible) return;
        const r = 3 * (.4 + ease(k) * 1.2) * q.r, s = 3 * (.4 + .6 * ease(k)) * (.6 + q.r * .4); q.m.position.set(tg.x + Math.cos(q.a) * r, ctx.PLAIN + s * .5 + k * 3, tg.z + Math.sin(q.a) * r); q.m.scale.setScalar(s); q.m.material.opacity = (1 - k) * .85; });
    },
    focus: [tg.x, ctx.PLAIN + tg.h * .5, tg.z], front, h: tg.h,
  };
}
