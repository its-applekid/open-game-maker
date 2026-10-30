// Title direction C: an opinionated landscape like the original paper-cut home screen, rebuilt in the studio's glass: four
// layers (mountains, castle and city, a wooded hill, the grass in front) drawn as frosted glass, softer the further back they sit
// (each layer is rendered small and stretched: the upscale is the blur, as with the living background). Paint is flung onto the
// scene from off screen; where it lands the world shows its colours, and characters from different kinds of games appear on the
// painted ground (a platformer hero and coin block, a dungeon knight, a slime, a space ship). Old paint fades back to glass.
// 2D canvas only: layers recomposite only when their paint changes; the top canvas draws the flying paint and the characters.
const PAINT = ['#fb4934', '#fabd2f', '#b8bb26', '#83a598', '#d3869b', '#8ec07c', '#fe8019'];
const SPLATS = ['00', '01', '02', '03', '05', '07', '10', '11', '14', '16', '17', '18', '19', '20'];
const VH = 900;
const img = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
let seed = 3;
const srnd = (a = 0, b = 1) => { seed = (seed * 16807) % 2147483647; return a + (b - a) * (seed / 2147483647); };
const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
const clamp01 = x => Math.min(1, Math.max(0, x)), ease = x => 1 - (1 - clamp01(x)) ** 3;

// ---------------- the landscape, in virtual units (900 tall, as wide as the screen needs; key pieces near the centre) ----------------
function ridge(VW, y, amp, step, jag) {   // a closed path from a wavy or jagged top line down past the bottom
  const p = new Path2D(); p.moveTo(-50, VH + 50);
  for (let x = -50; x <= VW + 50; x += step) p.lineTo(x, y + (jag ? (srnd() - .5) * amp * 2 : Math.sin(x / step * 1.3 + srnd(0, .8)) * amp));
  p.lineTo(VW + 50, VH + 50); p.closePath(); return p;
}
const rect = (x, y, w, h) => { const p = new Path2D(); p.rect(x, y, w, h); return p; };
const tri = (x, y, w, h) => { const p = new Path2D(); p.moveTo(x - w / 2, y); p.lineTo(x, y - h); p.lineTo(x + w / 2, y); p.closePath(); return p; };
const circ = (x, y, r) => { const p = new Path2D(); p.arc(x, y, r, 0, Math.PI * 2); return p; };
const crenel = (x, y, w, h) => { const p = rect(x, y, w, h), n = Math.max(2, Math.round(w / 18)); for (let i = 0; i < n; i += 2) p.rect(x + i * w / n, y - 12, w / n, 12); return p; };

function layers(VW, vis) {   // vis: how many virtual units are on screen; the castle and city stay inside it
  seed = 7; const cx = VW / 2, f = Math.min(1, vis / 1100);
  const L = [{ res: .2, alpha: .75, band: [470, 600], s: [] }, { res: .35, alpha: .85, band: [560, 680], s: [] }, { res: .5, alpha: .95, band: [690, 770], s: [] }, { res: .8, alpha: 1, band: [800, 880], s: [] }];
  // far: mountains with snow
  L[0].s.push([ridge(VW, 520, 70, 120, true), '#458588']);
  for (let x = cx - 900; x < cx + 900; x += srnd(220, 320)) L[0].s.push([tri(x, 470 + srnd(-20, 30), 120, 60), '#ebdbb2']);
  // castle and city on the hills
  L[1].s.push([ridge(VW, 620, 22, 90), '#689d6a']);
  const kx = cx - 330 * f;
  L[1].s.push([crenel(kx - 70, 520, 140, 110), '#d5c4a1'], [rect(kx - 12, 580, 24, 50), '#3c3836']);
  for (const [dx, h] of [[-95, 170], [95, 150], [0, 210]]) { L[1].s.push([crenel(kx + dx - 24, 630 - h, 48, h), '#bdae93'], [tri(kx + dx, 630 - h - 12, 64, 70), '#cc241d'], [rect(kx + dx - 6, 630 - h + 30, 12, 20), '#3c3836']); }
  L[1].s.push([rect(kx - 1, 330, 3, 40), '#3c3836'], [tri(kx + 18, 345, 30, -16), '#fabd2f']);
  const cityCols = ['#d79921', '#b16286', '#458588', '#d65d0e', '#98971a'];
  [[150, 60, 150], [215, 50, 210], [270, 66, 120], [340, 54, 250], [400, 70, 160], [470, 48, 110]].forEach(([dx, w, h], i) => {
    const x = cx + (dx - 60) * Math.max(.75, f) - (f < 1 ? 40 : 0), top = 625 - h;
    if (x + w > cx + vis / 2 + 30) return; L[1].s.push([rect(x, top, w, h), cityCols[i % 5]]);
    const win = new Path2D(); for (let wy = top + 14; wy < 610; wy += 22) for (let wx = x + 8; wx < x + w - 12; wx += 16) win.rect(wx, wy, 8, 11);
    L[1].s.push([win, '#fbf1c7']);
  });
  // a wooded hill with a cottage
  L[2].s.push([ridge(VW, 735, 18, 140), '#98971a']);
  for (let x = -40; x < VW + 40; x += srnd(70, 130)) {
    if (Math.abs(x - (cx + 60 * f)) < 90) continue;
    const y = 735 + srnd(-6, 10), h = srnd(70, 120);
    if (srnd() < .55) L[2].s.push([rect(x - 5, y - 20, 10, 24), '#7c6f64'], [tri(x, y - 14, h * .6, h), '#79740e']);
    else L[2].s.push([rect(x - 5, y - 30, 10, 34), '#7c6f64'], [circ(x, y - 50, h * .3), '#b8bb26']);
  }
  const hx = cx + 60 * f; L[2].s.push([rect(hx - 40, 690, 80, 50), '#fe8019'], [tri(hx, 692, 104, 50), '#9d0006'], [rect(hx - 10, 710, 20, 30), '#3c3836']);
  // grass in front, rocks and flowers
  L[3].s.push([ridge(VW, 840, 10, 160), '#8ec07c']);
  for (let x = 0; x < VW; x += srnd(60, 140)) {
    if (srnd() < .3) L[3].s.push([circ(x, 850, srnd(14, 26)), '#a89984']);
    else { const f = new Path2D(); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; f.arc(x + Math.cos(a) * 7, 820 + Math.sin(a) * 7, 5, 0, Math.PI * 2); f.closePath(); } L[3].s.push([f, pick(['#fb4934', '#fabd2f', '#d3869b'])]); }
  }
  return L;
}

export async function start({ el, reduced, active, cue }) {
  const manual = new URLSearchParams(location.search).has('manual');
  const [splats, ppc, pp, dun, ship] = await Promise.all([Promise.all(SPLATS.map(n => img(`art/splats/splat${n}.png`))),
    img('art/pp-chars.png'), img('art/pp-tiles.png'), img('art/dungeon.png'), img('art/space-playerShip1_blue.png')]);
  const marks = splats.filter(Boolean);
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  let W = 0, H = 0, k = 1, ox = 0, oy = 0, VW = 1600, L = [];
  const view = [], fx = mk(1, 1); fx.style.zIndex = 5;
  for (let i = 0; i < 4; i++) { const c = mk(1, 1); el.appendChild(c); view.push(c); }
  el.appendChild(fx);
  const tinted = new Map();
  const tint = (im, col) => { const key = im.src + col; if (!tinted.has(key)) { const c = mk(im.width, im.height), x = c.getContext('2d'); x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height); tinted.set(key, c); } return tinted.get(key); };

  function render(l, painted) {   // one layer, glass or painted, at the layer's own (blurry) resolution
    const c = mk(W * dpr * l.res, H * dpr * l.res), x = c.getContext('2d'), s = k * dpr * l.res;
    x.setTransform(s, 0, 0, s, ox * dpr * l.res, oy * dpr * l.res); x.lineJoin = 'round';
    for (const [p, col] of l.s) {
      if (painted) {
        x.save(); x.translate(0, 6); x.fillStyle = 'rgba(15,14,22,.35)'; x.fill(p); x.restore();
        x.fillStyle = col; x.fill(p); x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = 2; x.stroke(p);
      } else {
        x.fillStyle = 'rgba(206,214,236,.06)'; x.fill(p);
        const g = x.createLinearGradient(0, l.band[0] - 80, 0, VH); g.addColorStop(0, 'rgba(255,255,255,.16)'); g.addColorStop(.35, 'rgba(255,255,255,.03)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fill(p);
        x.strokeStyle = 'rgba(242,234,214,.42)'; x.lineWidth = 1.5 / Math.max(.5, k); x.stroke(p);
      }
    }
    return c;
  }
  function layout() {
    W = el.clientWidth || innerWidth; H = el.clientHeight || innerHeight;
    k = Math.min(H / VH, W / 520); VW = Math.max(1600, W / k); ox = (W - VW * k) / 2; oy = H - VH * k;
    const keep = L.map(l => l.splats);
    L = layers(VW, W / k);
    L.forEach((l, i) => {
      l.glass = render(l, false); l.paint = render(l, true); l.mask = mk(l.glass.width, l.glass.height); l.tmp = mk(l.glass.width, l.glass.height);
      l.splats = keep[i] || []; l.dirty = true;
      const v = view[i]; v.width = l.glass.width; v.height = l.glass.height; v.style.opacity = l.alpha;
    });
    fx.width = W * dpr; fx.height = H * dpr;
  }
  // a splat on a layer: grows in for a moment with a wet colour, stays a while, fades back to glass
  const LIFE = [26, 40];
  function compose(l, t) {
    const m = l.mask.getContext('2d'), s = k * dpr * l.res; m.setTransform(1, 0, 0, 1, 0, 0); m.clearRect(0, 0, l.mask.width, l.mask.height);
    const v = view[L.indexOf(l)].getContext('2d'); v.setTransform(1, 0, 0, 1, 0, 0); v.clearRect(0, 0, l.mask.width, l.mask.height); v.drawImage(l.glass, 0, 0);
    let busy = false;
    const stamp = (x, sp, im, a, sz) => { x.save(); x.globalAlpha = a; x.translate((ox + sp.x * k) * dpr * l.res, (oy + sp.y * k) * dpr * l.res); x.rotate(sp.rot); const d = sz * s; x.drawImage(im, -d / 2, -d / 2, d, d); x.restore(); };
    for (const sp of l.splats) {
      const age = t - sp.born, grow = ease(age / .35), fade = 1 - clamp01((age - sp.life) / 3);
      if (age < 1.6 || (age > sp.life && fade > 0)) busy = true;
      stamp(m, sp, sp.im, fade, sp.size * (.55 + .45 * grow));
    }
    l.splats = l.splats.filter(sp => t - sp.born < sp.life + 3);
    const x = l.tmp.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, l.tmp.width, l.tmp.height);
    x.drawImage(l.paint, 0, 0); x.globalCompositeOperation = 'destination-in'; x.drawImage(l.mask, 0, 0); x.globalCompositeOperation = 'source-over';
    v.drawImage(l.tmp, 0, 0);
    for (const sp of l.splats) { const age = t - sp.born; if (age < 1.6) stamp(v, sp, tint(sp.im, sp.col), .9 * (1 - clamp01((age - .4) / 1.2)), sp.size * (.55 + .45 * ease(age / .35))); }
    l.dirty = busy;
    for (const p of PROPS) if (p.layer === L.indexOf(l)) p.cov = painted(l, propX(p), p.y, t);
  }
  const propX = p => VW / 2 + p.dx * Math.min(1, W / k / 1100);
  const painted = (l, vx, vy, t) =>   // is a point of a layer under fresh paint? (near a splat's middle; no pixel readback)
    l.splats.some(sp => t - sp.born < sp.life && Math.hypot(sp.x - vx, sp.y - vy) < sp.size * .3) ? 1 : 0;

  // characters from different kinds of games, standing on painted ground only (anchors in virtual units from the centre)
  const sprite = (x, im, cols, sz, i, px, py, sc, flip) => { if (!im) return; x.save(); x.translate(px, py); if (flip) x.scale(-1, 1); x.drawImage(im, (i % cols) * sz, Math.floor(i / cols) * sz, sz, sz, -sz * sc / 2, -sz * sc, sz * sc, sz * sc); x.restore(); };
  const PROPS = [
    { layer: 3, dx: -380, y: 838, draw(x, t, px, py, s) { const hop = Math.max(0, Math.sin(t * 2.4)) * 40 * s; sprite(x, ppc, 9, 24, Math.floor(t * 8) % 2, px + Math.sin(t * .6) * 60 * s, py - hop, 3 * s); } },
    { layer: 3, dx: -250, y: 760, draw(x, t, px, py, s) { sprite(x, pp, 20, 18, 10, px, py + Math.sin(t * 2) * 4 * s, 3 * s); sprite(x, pp, 20, 18, 151 + Math.floor(t * 6) % 2, px, py - 62 * s + Math.sin(t * 3) * 8 * s, 2.6 * s); } },
    { layer: 3, dx: 330, y: 842, draw(x, t, px, py, s) { sprite(x, ppc, 9, 24, 18 + Math.floor(t * 4) % 2, px - Math.sin(t * .4) * 70 * s, py, 2.6 * s, Math.cos(t * .4) > 0); } },
    { layer: 2, dx: 220, y: 742, draw(x, t, px, py, s) { sprite(x, dun, 12, 16, 97, px, py - Math.abs(Math.sin(t * 5)) * 4 * s, 3 * s); sprite(x, dun, 12, 16, 99, px + 46 * s, py, 3 * s); } },
    { layer: 0, dx: 120, y: 520, sky: true, draw(x, t, px, py, s) { if (!ship) return; const f = (t * .05) % 1, sx = (f - .5) * W * 1.6; x.save(); x.translate(W / 2 * dpr + sx, py - 260 * s + Math.sin(t) * 14 * s); x.rotate(Math.PI / 2); x.drawImage(ship, -ship.width * .3 * s, -ship.height * .3 * s, ship.width * .6 * s, ship.height * .6 * s); x.restore(); } },
  ];
  for (const p of PROPS) p.a = 0;

  // flying paint: from below either side of the screen, arcing onto a layer
  const blobs = [], drops = [];
  function throwPaint(t, at) {
    const visible = W / k, li = at?.li ?? pick([0, 1, 1, 2, 2, 3, 3]), l = L[li];
    const vx = at?.x ?? VW / 2 + rnd(-.48, .48) * visible, vy = at?.y ?? rnd(...l.band);
    const sp = { x: vx, y: vy, rot: rnd(0, 6.3), im: pick(marks), col: pick(PAINT), size: rnd(200, 340) * (li === 0 ? 1.6 : li === 1 ? 1.3 : 1), life: rnd(...LIFE) };
    if (at) { sp.born = t - (at.age ?? 5); l.splats.push(sp); l.dirty = true; return; }
    const left = Math.random() < .5, from = [left ? -40 : W + 40, H + 30], to = [ox + vx * k, oy + vy * k];
    blobs.push({ from, to, t: 0, dur: rnd(.7, 1), col: sp.col, land() { sp.born = clock; l.splats.push(sp); l.dirty = true; cue?.(pick(['drip1', 'drip2', 'drip3']), .2);
      for (let i = 0; i < 6; i++) drops.push({ x: to[0], y: to[1], vx: rnd(-160, 160), vy: rnd(-260, -80), t: 0, col: sp.col }); } });
  }

  let clock = 0, next = 0, running = false, last = 0;
  layout();
  // first frame: already partly painted, so the scene has colour before any paint flies
  for (const [li, f, y] of [[1, -.3, 600], [1, .25, 590], [2, .05, 720], [3, -.2, 845], [0, .3, 520], [3, .28, 845], [2, -.32, 730]]) throwPaint(0, { li, x: VW / 2 + f * (W / k), y, age: rnd(4, 12) });
  if (reduced) for (const [li, f, y] of [[0, -.25, 500], [2, .35, 725], [1, 0, 610]]) throwPaint(0, { li, x: VW / 2 + f * (W / k), y, age: 5 });

  function frame(dt) {
    clock += dt;
    if (!reduced && clock >= next) { throwPaint(clock); next = clock + rnd(1.3, 2.3); }
    for (const l of L) if (l.dirty || reduced) compose(l, clock);
    const x = fx.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, fx.width, fx.height); x.imageSmoothingEnabled = false;
    const s = k * dpr;
    for (const p of PROPS) {
      const vx = propX(p), on = p.sky ? L[0].splats.length + L[1].splats.length > 3 : p.cov > .4;
      p.a = reduced ? +on : clamp01(p.a + (on ? 1 : -1) * dt * 2);
      if (p.a > 0) { x.globalAlpha = p.a; p.draw(x, clock, (ox + vx * k) * dpr, (oy + p.y * k) * dpr, s); x.globalAlpha = 1; }
    }
    for (let i = blobs.length - 1; i >= 0; i--) {
      const b = blobs[i]; b.t += dt; const q = clamp01(b.t / b.dur), arc = -Math.min(H * .5, 380) * 4 * q * (1 - q);
      const px = b.from[0] + (b.to[0] - b.from[0]) * q, py = b.from[1] + (b.to[1] - b.from[1]) * q + arc;
      x.fillStyle = b.col; x.beginPath(); x.arc(px * dpr, py * dpr, (7 + 5 * (1 - q)) * dpr, 0, Math.PI * 2); x.fill();
      if (q >= 1) { blobs.splice(i, 1); b.land(); }
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]; d.t += dt; d.vy += 900 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
      x.fillStyle = d.col; x.globalAlpha = 1 - d.t / .6; x.beginPath(); x.arc(d.x * dpr, d.y * dpr, 3.5 * dpr, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
      if (d.t > .6) drops.splice(i, 1);
    }
  }
  function tick(now) {
    if (!active()) { running = false; return; }
    requestAnimationFrame(tick);
    const dt = (now - last) / 1000; if (dt < 1 / 34) return;   // 30 fps is plenty here
    last = now; frame(Math.min(dt, .1));
  }
  function wake() {
    if (reduced || manual) { if (active()) frame(0); return; }
    if (!running && active()) { running = true; last = performance.now(); requestAnimationFrame(tick); }
  }
  let rz; new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(() => { layout(); frame(0); }, 120); }).observe(el);
  document.addEventListener('visibilitychange', wake);
  frame(0); el.classList.add('on'); wake();
  let cpu = 0, frames = 0;
  window.__title = { step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) { const a = performance.now(); frame(dt); cpu += performance.now() - a; frames++; } },
    info: () => ({ cpuMs: +(cpu / Math.max(1, frames)).toFixed(2), frames, dpr, splats: L.map(l => l.splats.map(sp => [Math.round(sp.x), Math.round(sp.y), Math.round(clock - sp.born)])) }) };
  return { wake };
}
