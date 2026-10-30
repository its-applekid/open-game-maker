// A scene in the title town, after the arcade monster-rampage games: a giant monster comes into town, climbs a tall house,
// punches its windows out, the house crumbles, the monster jumps down and leaves, and the house is rebuilt inside wooden
// scaffolding. Three looks: a: a low-poly giant ape; b: a pixel-art arcade monster on a flat sprite with pixel effects;
// c: a low-poly lizard kaiju that wades in from the bay. Runs on its own loop (PER seconds).
import * as THREE from 'three';

export const PER = 52;
const clamp01 = x => Math.min(1, Math.max(0, x)), smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const ease = x => 1 - (1 - clamp01(x)) ** 3, lerp = (a, b, k) => a + (b - a) * k;
// the timeline (seconds into the loop)
const T = { walkIn: 0, climb: 8, punch: 12, crumble: 17.5, jump: 18, leave: 20, gone: 29, build: 30, built: 42 };

// ---------------- monsters ----------------
const mat = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
function part(g, w, h, d, c, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); g.add(m); return m; }
function pivot(parent, x, y, z) { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; }

// a chunky ape: fur, a lighter chest and face, long arms; about 11 units tall standing
function ape() {
  const g = new THREE.Group(), body = pivot(g, 0, 5.2, 0), fur = '#9c7a68', light = '#d9b8a0', dark = '#5a4640';
  part(body, 3.6, 3.6, 2.4, fur, 0, 1.2, 0); part(body, 2.4, 2.2, .3, light, 0, 1.1, 1.22);
  const head = pivot(body, 0, 3.3, .3); part(head, 2.2, 1.9, 2, fur, 0, .7, 0); part(head, 1.6, 1, .4, light, 0, .45, 1.05);
  part(head, .3, .3, .1, dark, -.45, 1.05, 1.02); part(head, .3, .3, .1, dark, .45, 1.05, 1.02); part(head, 2.3, .35, .4, dark, 0, 1.35, .85);
  const arm = s => { const sh = pivot(body, s * 2.1, 2.6, 0), up = part(sh, 1.1, 2.6, 1.1, fur, 0, -1.2, 0), el = pivot(sh, 0, -2.4, 0); part(el, 1, 2.4, 1, fur, 0, -1.1, 0); const hand = part(el, 1.3, 1, 1.3, light, 0, -2.6, 0); return { sh, el, hand }; };
  const leg = s => { const hp = pivot(g, s * 1, 5.2, 0); part(hp, 1.4, 2.8, 1.5, fur, 0, -1.4, 0); const kn = pivot(hp, 0, -2.6, 0); part(kn, 1.3, 2.4, 1.4, fur, 0, -1.2, 0); part(kn, 1.5, .5, 2, dark, 0, -2.5, .3); return { hp, kn }; };
  return { g, body, head, arms: [arm(-1), arm(1)], legs: [leg(-1), leg(1)], h: 11, tail: null };
}
// a lizard kaiju: green with a cream belly, spikes down its back, a long swinging tail
function lizard() {
  const g = new THREE.Group(), body = pivot(g, 0, 5, 0), skin = '#8fb38a', belly = '#efe0b8', spike = '#c9806a', dark = '#3c4a3a';
  part(body, 3.2, 4.4, 2.8, skin, 0, 1.6, 0); part(body, 2.2, 3.6, .3, belly, 0, 1.4, 1.42);
  for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(.5 - i * .06, 1.3, 4), mat(spike)); s.position.set(0, 3.4 - i * 1.1, -1.5); s.rotation.x = -.5; body.add(s); }
  const head = pivot(body, 0, 4, .4); part(head, 2, 1.6, 2.4, skin, 0, .6, .4); part(head, 1.6, .7, 1.4, skin, 0, .2, 1.8); part(head, .3, .3, .1, '#fbf1c7', -.5, 1.05, 1.62); part(head, .3, .3, .1, '#fbf1c7', .5, 1.05, 1.62);
  part(head, 1.5, .25, .2, dark, 0, -.05, 2.5);
  const arm = s => { const sh = pivot(body, s * 1.8, 2.8, .4), up = part(sh, .9, 1.8, .9, skin, 0, -.8, 0), el = pivot(sh, 0, -1.6, 0); part(el, .8, 1.6, .8, skin, 0, -.7, 0); const hand = part(el, 1, .7, 1, belly, 0, -1.7, 0); return { sh, el, hand }; };
  const leg = s => { const hp = pivot(g, s * 1.1, 5, 0); part(hp, 1.6, 2.8, 1.8, skin, 0, -1.3, 0); const kn = pivot(hp, 0, -2.5, 0); part(kn, 1.5, 2.3, 1.6, skin, 0, -1.1, 0); part(kn, 1.8, .5, 2.4, dark, 0, -2.4, .4); return { hp, kn }; };
  const tail = []; let prev = pivot(body, 0, .2, -1.3);
  for (let i = 0; i < 6; i++) { const seg = pivot(prev, 0, 0, i ? -1.3 : 0); part(seg, 1.6 - i * .22, 1.4 - i * .18, 1.5, skin, 0, 0, -.6); tail.push(seg); prev = seg; }
  return { g, body, head, arms: [arm(-1), arm(1)], legs: [leg(-1), leg(1)], h: 11, tail };
}
// poses (angles in radians); ph is a running phase
function pose(m, kind, ph, k = 0) {
  const [la, ra] = m.arms, [ll, rl] = m.legs, sw = Math.sin(ph), cw = Math.cos(ph);
  m.body.rotation.set(0, 0, 0); m.head.rotation.set(0, 0, 0);
  for (const a of m.arms) { a.sh.rotation.set(0, 0, 0); a.el.rotation.set(0, 0, 0); }
  for (const l of m.legs) { l.hp.rotation.set(0, 0, 0); l.kn.rotation.set(0, 0, 0); }
  if (kind === 'walk') {   // a heavy stomp: legs swing, arms knuckle along, the body rocks
    ll.hp.rotation.x = sw * .55; rl.hp.rotation.x = -sw * .55; ll.kn.rotation.x = Math.max(0, -sw) * .7; rl.kn.rotation.x = Math.max(0, sw) * .7;
    la.sh.rotation.x = -sw * .5 + .2; ra.sh.rotation.x = sw * .5 + .2; m.body.rotation.z = sw * .06; m.body.rotation.x = .15;
  } else if (kind === 'climb') {   // arms reach up the wall in turn, legs push
    la.sh.rotation.x = -2.6 + sw * .5; ra.sh.rotation.x = -2.6 - sw * .5; la.el.rotation.x = -.3 - Math.max(0, sw) * .6; ra.el.rotation.x = -.3 - Math.max(0, -sw) * .6;
    ll.hp.rotation.x = -.6 + sw * .4; rl.hp.rotation.x = -.6 - sw * .4; ll.kn.rotation.x = .9; rl.kn.rotation.x = .9; m.body.rotation.x = -.15;
  } else if (kind === 'punch') {   // hang on with one arm, punch with the other (k: 0..1 through a punch)
    const hit = k < .35 ? ease(k / .35) : 1 - smooth((k - .35) / .65), side = Math.floor(ph) % 2;
    const hold = side ? la : ra, swing = side ? ra : la;
    hold.sh.rotation.x = -2.7; swing.sh.rotation.x = -1.2 - hit * .5; swing.el.rotation.x = -1.4 + hit * 1.3;
    ll.hp.rotation.x = -.7; rl.hp.rotation.x = -.5; ll.kn.rotation.x = 1; rl.kn.rotation.x = .8; m.body.rotation.y = (side ? -1 : 1) * hit * .25; m.head.rotation.x = -.2;
  } else if (kind === 'jump') {   // tucked, arms up
    la.sh.rotation.x = -2.8; ra.sh.rotation.x = -2.8; la.sh.rotation.z = .4; ra.sh.rotation.z = -.4; ll.hp.rotation.x = -1; rl.hp.rotation.x = -1; ll.kn.rotation.x = 1.6; rl.kn.rotation.x = 1.6;
  } else if (kind === 'roar') {   // chest beat or roar
    la.sh.rotation.x = -1.4; ra.sh.rotation.x = -1.4; la.sh.rotation.z = -.5 + sw * .3; ra.sh.rotation.z = .5 - sw * .3; la.el.rotation.x = -1.2; ra.el.rotation.x = -1.2; m.head.rotation.x = -.35;
  }
  if (m.tail) m.tail.forEach((s, i) => { s.rotation.y = Math.sin(ph * .8 - i * .5) * .18; s.rotation.x = .05; });
}

// ---------------- the pixel-art monster (b) ----------------
// frames drawn from a few rectangles into a 32 x 32 canvas: a squat arcade monster with an outline
const PIX = { o: '#3c3836', f: '#b16286', l: '#d3869b', b: '#f2c5d2', e: '#fbf1c7', p: '#3c3836', t: '#fe8019' };
function pixFrame(kind, n) {
  const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
  const r = (col, a, b, w, h) => { x.fillStyle = PIX[col]; x.fillRect(a, b, w, h); };
  const box = (col, a, b, w, h) => { r('o', a - 1, b - 1, w + 2, h + 2); r(col, a, b, w, h); };
  const leg = (a, lift) => box('f', a, 24 - lift, 5, 7);
  if (kind === 'walk') { leg(9, n ? 2 : 0); leg(18, n ? 0 : 2); }
  else if (kind === 'climb' || kind === 'punch') { leg(9, 3); leg(18, 1); }
  else { leg(9, 0); leg(18, 0); }
  box('f', 8, 11, 16, 14); r('l', 11, 15, 10, 9); r('b', 13, 17, 6, 6);                                   // body
  box('f', 10, 3, 12, 9); r('e', 12, 6, 3, 3); r('e', 17, 6, 3, 3); r('p', 13, 7, 2, 2); r('p', 18, 7, 2, 2);  // head
  r('o', 13, 10, 6, 1); for (let i = 0; i < 3; i++) r('e', 14 + i * 2, 10, 1, 1);                           // teeth
  r('t', 11, 1, 2, 3); r('t', 19, 1, 2, 3);                                                                  // horns
  const armUp = (a) => { box('f', a, 1, 4, 11); r('l', a, 0, 4, 2); };
  const armDown = (a, d) => { box('f', a, 13 + d, 4, 9); r('l', a, 21 + d, 4, 2); };
  if (kind === 'climb') { n ? (armUp(3), armDown(25, 0)) : (armDown(3, 0), armUp(25)); }
  else if (kind === 'punch') { armUp(3); box('f', 24, 9, 7, 4); r('l', 29, 8, 3, 6); }
  else if (kind === 'jump') { armUp(3); armUp(25); }
  else { armDown(3, n ? 1 : 0); armDown(25, n ? 0 : 1); }
  const tex = new THREE.CanvasTexture(c); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false;
  return tex;
}
function pixSprite(draw) {   // a flat quad that keeps facing the camera around the vertical axis
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, .5, 0), new THREE.MeshBasicMaterial({ map: draw, transparent: true, alphaTest: .5, side: THREE.DoubleSide }));
  return m;
}
function powTex() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 20; const x = c.getContext('2d');
  x.fillStyle = '#3c3836'; x.fillRect(0, 2, 32, 16); x.fillStyle = '#fabd2f'; x.fillRect(1, 3, 30, 14);
  const L = { P: ['111', '101', '111', '100', '100'], O: ['111', '101', '101', '101', '111'], W: ['10001', '10001', '10101', '10101', '01010'], '!': ['1', '1', '1', '0', '1'] };
  let cx = 3; for (const ch of 'POW!') { const g = L[ch]; g.forEach((row, yy) => [...row].forEach((v, xx) => { if (v === '1') { x.fillStyle = '#fb4934'; x.fillRect(cx + xx * 1.5, 5 + yy * 2, 1.5, 2); } })); cx += g[0].length * 1.5 + 1.5; }
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; return t;
}

// ---------------- the scene ----------------
// ctx: { scene, camera, look, target: { x, z, rot, h, w, mesh, cut }, path: [[x, z], ...] (from where the monster appears to the
// foot of the house), exit (path out), ground(x, z), scaffold(w, d, h, n), layers(sc, count), stepped(k, h), steps(h), color }
export function rampage(ctx, v) {
  const { scene, camera, target: tg } = ctx;
  const front = [Math.sin(tg.rot), Math.cos(tg.rot)];   // the house's front faces the street
  const climbAt = [tg.x + front[0] * (tg.w / 2 + 1.3), tg.z + front[1] * (tg.w / 2 + 1.3)];   // hugging the front wall
  let M = null, spr = null, frames = null, pow = null;
  if (v === 'b') {
    frames = { walk: [pixFrame('walk', 0), pixFrame('walk', 1)], climb: [pixFrame('climb', 0), pixFrame('climb', 1)], punch: [pixFrame('punch', 0)], jump: [pixFrame('jump', 0)], idle: [pixFrame('idle', 0), pixFrame('idle', 1)] };
    spr = pixSprite(frames.walk[0]); spr.scale.set(17, 17, 1); scene.add(spr);
    pow = pixSprite(powTex()); pow.scale.set(6, 3.75, 1); pow.visible = false; scene.add(pow);
  } else { M = v === 'c' ? lizard() : ape(); M.g.scale.setScalar(1.35); scene.add(M.g); }
  // debris: chunks of the house's colour (or pixel squares for b) thrown out of each punch and the collapse
  const chunkGeo = new THREE.BoxGeometry(1, 1, 1), chunks = [];
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(chunkGeo, v === 'b' ? new THREE.MeshBasicMaterial({ color: ['#fbf1c7', '#d5c4a1', '#fe8019', '#83a598'][i % 4] }) : mat(['#f2e5bc', '#d9c2a8', '#c9806a', '#7d8fb8'][i % 4]));
    m.visible = false; scene.add(m); chunks.push({ m, seed: i });
  }
  const holes = [];   // dark punched-out windows on the house front
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, .2), new THREE.MeshBasicMaterial({ color: '#2b2522' })); m.visible = false; scene.add(m); holes.push(m); }
  const dust = []; for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#efe4d6', transparent: true, flatShading: true })); m.visible = false; scene.add(m); dust.push({ m, a: i / 14 * Math.PI * 2, r: .6 + (i * .37) % .5 }); }
  const sc = ctx.scaffold(tg.w + .9, tg.d + .9, tg.h + .8, ctx.steps(tg.h)); sc.position.set(tg.x, ctx.PLAIN, tg.z); sc.rotation.y = tg.rot; scene.add(sc);
  const along = (pts, k) => {   // point and heading at fraction k along a polyline
    let L = 0; const seg = []; for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(l); L += l; }
    let d = clamp01(k) * L, i = 0; while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
    const a = pts[i], b = pts[i + 1], u = seg[i] ? d / seg[i] : 0; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, Math.atan2(b[0] - a[0], b[1] - a[1]), L];
  };
  const pathIn = [...ctx.path, climbAt], pathOut = [climbAt, ...ctx.exit];
  const place = (x, y, z, yaw, kind, ph, k) => {
    if (M) { M.g.position.set(x, y, z); M.g.rotation.y = yaw; pose(M, kind, ph, k); M.g.visible = true; }
    else { spr.position.set(x, y, z); const f = frames[kind === 'roar' ? 'idle' : kind]; spr.material.map = f[Math.floor(ph / Math.PI) % f.length]; spr.rotation.y = Math.atan2(camera.position.x - x, camera.position.z - z); spr.visible = true; }
  };
  return {
    update(t) {
      const lt = ((t % PER) + PER) % PER, g = ctx.ground, yaw0 = tg.rot + Math.PI;   // facing the house
      // the house: standing, punched, crumbling, gone, rebuilt
      tg.mesh.visible = true; tg.mesh.position.set(tg.x, ctx.PLAIN, tg.z); tg.cut.value = 9999; ctx.layers(sc, 0);
      if (lt >= T.crumble && lt < T.crumble + 2.6) { const k = (lt - T.crumble) / 2.6, s = clamp01((k - .1) / .9) ** 2.2; tg.mesh.position.y = ctx.PLAIN - s * tg.h; tg.mesh.position.x = tg.x + Math.sin(lt * 50) * .15 * (1 - s); }
      else if (lt >= T.crumble + 2.6 && lt < T.build) tg.mesh.visible = false;
      else if (lt >= T.build && lt < T.built) { const k = (lt - T.build) / (T.built - T.build), n = ctx.steps(tg.h); tg.cut.value = ctx.PLAIN + tg.h * ctx.stepped(k, tg.h); ctx.layers(sc, Math.min(n, k * n + .55) + .45); }
      else if (lt >= T.built && lt < T.built + 4) { const n = ctx.steps(tg.h); ctx.layers(sc, n - (lt - T.built) / .4); }
      // the monster
      if (M) M.g.visible = false; if (spr) spr.visible = false; if (pow) pow.visible = false;
      const walkK = (lt - T.walkIn) / (T.climb - T.walkIn);
      if (lt < T.climb) { const [x, z, yaw] = along(pathIn, smooth(walkK) * .5 + walkK * .5); place(x, g(x, z), z, yaw, 'walk', lt * 5); }
      else if (lt < T.punch) { const k = (lt - T.climb) / (T.punch - T.climb); place(climbAt[0], ctx.PLAIN + tg.h * .32 * ease(k), climbAt[1], yaw0, 'climb', lt * 6); }
      else if (lt < T.crumble) { const k = (lt - T.punch) / (T.crumble - T.punch) * 4; place(climbAt[0], ctx.PLAIN + tg.h * .32, climbAt[1], yaw0, 'punch', k, k % 1);
        if (pow && k % 1 > .3 && k % 1 < .75) { pow.visible = true; pow.position.set(climbAt[0] - front[0] * 1.5, ctx.PLAIN + tg.h * .32 + 9 + (Math.floor(k) % 2) * 1.5, climbAt[1] - front[1] * 1.5); pow.rotation.y = Math.atan2(camera.position.x - pow.position.x, camera.position.z - pow.position.z); } }
      else if (lt < T.leave) { const k = (lt - T.jump) / (T.leave - T.jump), out = [climbAt[0] + front[0] * 8, climbAt[1] + front[1] * 8];
        if (lt < T.jump) place(climbAt[0], ctx.PLAIN + tg.h * .32, climbAt[1], yaw0, 'roar', lt * 8);
        else place(lerp(climbAt[0], out[0], k), lerp(ctx.PLAIN + tg.h * .32, g(...out), k) + Math.sin(k * Math.PI) * 5, lerp(climbAt[1], out[1], k), tg.rot, 'jump', 0); }
      else if (lt < T.gone) { const k = (lt - T.leave) / (T.gone - T.leave), [x, z, yaw] = along([[climbAt[0] + front[0] * 8, climbAt[1] + front[1] * 8], ...ctx.exit], k); place(x, g(x, z) - (v === 'c' ? Math.max(0, -g(x, z)) * 0 : 0), z, yaw, k < .12 ? 'roar' : 'walk', lt * 5); }
      // punched windows and flying chunks
      holes.forEach((m, i) => { const at = T.punch + (i + .35) * (T.crumble - T.punch) / 4; m.visible = lt > at && lt < T.crumble + 1;
        const sx = (i % 2 ? .25 : -.25) * tg.w, sy = tg.h * (.5 + (i >> 1) * .18), c = Math.cos(tg.rot), s = Math.sin(tg.rot);
        m.position.set(tg.x + front[0] * (tg.w / 2 + .05) + c * sx, ctx.PLAIN + sy, tg.z + front[1] * (tg.w / 2 + .05) - s * sx); m.rotation.y = tg.rot; });
      chunks.forEach(({ m, seed }) => {
        const burst = seed < 24 ? Math.floor(seed / 6) : 4, at = burst < 4 ? T.punch + (burst + .35) * (T.crumble - T.punch) / 4 : T.crumble + .4, dt = lt - at, life = burst < 4 ? 1.4 : 2.2;
        m.visible = dt > 0 && dt < life; if (!m.visible) return;
        const a = seed * 2.4, sp = 3 + (seed % 5), up = 4 + (seed % 3) * 2, bx = tg.x + front[0] * (tg.w / 2 + .5), bz = tg.z + front[1] * (tg.w / 2 + .5), by = ctx.PLAIN + (burst < 4 ? tg.h * (.5 + (burst >> 1) * .18) : tg.h * .3);
        m.position.set(bx + (front[0] * 1.2 + Math.cos(a) * .6) * sp * dt, Math.max(ctx.PLAIN, by + up * dt - 9 * dt * dt), bz + (front[1] * 1.2 + Math.sin(a) * .6) * sp * dt);
        m.rotation.set(dt * 5 + seed, dt * 3, 0); m.scale.setScalar((v === 'b' ? .55 : .45 + (seed % 3) * .15) * (1 - dt / life * .4));
      });
      dust.forEach(q => { const k = (lt - T.crumble - .3) / 3.6; q.m.visible = k > 0 && k < 1; if (!q.m.visible) return;
        const r = 3 * (.4 + ease(k) * 1.2) * q.r, s = 3 * (.4 + .6 * ease(k)) * (.6 + q.r * .4); q.m.position.set(tg.x + Math.cos(q.a) * r, ctx.PLAIN + s * .5 + k * 3, tg.z + Math.sin(q.a) * r); q.m.scale.setScalar(s); q.m.material.opacity = (1 - k) * .85; });
    },
    focus: [tg.x, ctx.PLAIN + tg.h * .5, tg.z], front, h: tg.h,
  };
}
