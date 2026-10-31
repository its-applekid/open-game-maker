// Home screen: stacked paper-cut SVG layers + one JS clock for wind, clouds, leaves and accents.
// Paper look is cheap on purpose: every shape is drawn twice (offset dark copy = cut-paper shadow),
// and one static grain overlay covers the page (no live SVG filters on moving groups).
const NS = 'http://www.w3.org/2000/svg';
const W = 1600, H = 900;
let seed = 7;
const rnd = (a = 0, b = 1) => { seed = (seed * 16807) % 2147483647; return a + (b - a) * (seed / 2147483647); };
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent?.appendChild(e); return e; };
const SH = 'rgba(70,45,25,.22)';

function svgLayer(id, aspect = 'xMidYMax slice') {
  const s = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: aspect });
  document.getElementById(id).appendChild(s); return s;
}
// paper piece: shadow copy offset down, then the piece, then a faint light edge
function piece(parent, tag, attrs, fill, dy = 7) {
  el(tag, { ...attrs, fill: SH, transform: `translate(0 ${dy}) ${attrs.transform || ''}` }, parent);
  return el(tag, { ...attrs, fill, stroke: 'rgba(255,255,255,.35)', 'stroke-width': 2 }, parent);
}
function hill(y, amp, n, x0 = -60, x1 = W + 60) {
  const pts = []; for (let i = 0; i <= n; i++) pts.push([x0 + (x1 - x0) * i / n, y + Math.sin(i * 1.7 + rnd(0, 6)) * amp * rnd(.4, 1)]);
  let d = `M${x0} ${H + 40} L${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) { const [px, py] = pts[i - 1], [x, yy] = pts[i]; d += ` Q${px + (x - px) / 2} ${Math.min(py, yy) - amp * .5} ${x} ${yy}`; }
  return d + ` L${x1} ${H + 40} Z`;
}
const groundY = (d, x) => { // rough: sample the hill path by drawing it once
  const p = new Path2D(d); const c = groundY.ctx ||= document.createElement('canvas').getContext('2d');
  for (let y = 0; y < H; y += 2) if (c.isPointInPath(p, x, y)) return y; return H;
};

const sways = []; // { node, x, y, amp, phase, kind }
function pine(parent, x, y, s, color) {
  const g = el('g', {}, parent);
  piece(g, 'rect', { x: x - 4 * s, y: y - 18 * s, width: 8 * s, height: 20 * s, rx: 2 }, '#9b6b43', 5);
  for (let i = 0; i < 3; i++) { const w = (34 - i * 8) * s, top = y - (38 + i * 22) * s, bot = y - (10 + i * 20) * s;
    piece(g, 'path', { d: `M${x - w} ${bot} Q${x} ${bot + 6 * s} ${x + w} ${bot} L${x} ${top - 12 * s} Z` }, color, 6); }
  sways.push({ node: g, x, y, amp: 1.6 + rnd(0, 1), phase: rnd(0, 6) });
}
function roundTree(parent, x, y, s, greens) {
  const g = el('g', {}, parent);
  piece(g, 'path', { d: `M${x - 7 * s} ${y} L${x - 4 * s} ${y - 60 * s} L${x + 4 * s} ${y - 60 * s} L${x + 7 * s} ${y} Z` }, '#9b6b43', 6);
  const crown = el('g', {}, g);
  [[-26, -70, 30], [24, -74, 28], [0, -96, 36], [-10, -64, 24], [16, -60, 22]].forEach(([dx, dy, r], i) =>
    piece(crown, 'circle', { cx: x + dx * s, cy: y + dy * s, r: r * s }, greens[i % greens.length], 7));
  sways.push({ node: g, x, y, amp: 2.2 + rnd(0, 1.2), phase: rnd(0, 6), crown, s });
}
function bush(parent, x, y, s, c) {
  const g = el('g', {}, parent);
  [[-18, -10, 18], [16, -12, 16], [0, -22, 20]].forEach(([dx, dy, r]) => piece(g, 'circle', { cx: x + dx * s, cy: y + dy * s, r: r * s }, c, 5));
  sways.push({ node: g, x, y, amp: 1.2, phase: rnd(0, 6) });
}
// a fan of thin curved blades: taller in the middle, leaning outward, darker blades behind lighter ones
function blade(parent, bx, y, h, lean, w, c) {
  const tx = bx + lean, ty = y - h;
  piece(parent, 'path', { d: `M${bx - w} ${y} Q${bx - w * .6 + lean * .35} ${y - h * .55} ${tx} ${ty} Q${bx + w * .5 + lean * .45} ${y - h * .5} ${bx + w} ${y} Z` }, c, 3);
}
function tuft(parent, x, y, s, [dark, light]) {
  const g = el('g', {}, parent);
  const n = 4 + Math.floor(rnd(0, 4)), mid = (n - 1) / 2;
  const blades = Array.from({ length: n }, (_, i) => {
    const t = (i - mid) / (mid || 1); // -1 .. 1 across the fan
    return { bx: x + t * 7 * s + rnd(-2, 2) * s, h: (40 - Math.abs(t) * 16 + rnd(-6, 6)) * s, lean: (t * 16 + rnd(-5, 5)) * s, w: (4.6 + rnd(0, 1.8)) * s, back: i % 2 === 0 };
  });
  for (const b of blades) if (b.back) blade(g, b.bx, y, b.h * 1.05, b.lean, b.w, dark);
  for (const b of blades) if (!b.back) blade(g, b.bx, y, b.h, b.lean, b.w, light);
  sways.push({ node: g, x, y, amp: 5 + rnd(0, 3), phase: rnd(0, 6), grass: true });
}
function flower(parent, x, y, c) {
  const g = el('g', {}, parent);
  piece(g, 'rect', { x: x - 1.5, y: y - 26, width: 3, height: 26 }, '#5b8f3a', 3);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; piece(g, 'circle', { cx: x + Math.cos(a) * 6, cy: y - 28 + Math.sin(a) * 6, r: 5 }, c, 2); }
  el('circle', { cx: x, cy: y - 28, r: 4, fill: '#fff3b0' }, g);
  sways.push({ node: g, x, y, amp: 6, phase: rnd(0, 6), grass: true });
}
function cloud(parent, x, y, s) {
  const g = el('g', {}, parent);
  [[0, 0, 40], [44, -14, 46], [92, 0, 38], [46, 12, 40]].forEach(([dx, dy, r]) => piece(g, 'circle', { cx: dx * s, cy: dy * s, r: r * s }, '#fffdf6', 6));
  return { g, x, y, s, v: 8 + rnd(0, 10) };
}

export function buildHome() {
  // sun
  const sun = svgLayer('L-sun', 'xMaxYMin meet');
  const sunG = el('g', { transform: 'translate(1360 170)' }, sun);
  const rays = el('g', {}, sunG);
  for (let i = 0; i < 12; i++) piece(rays, 'path', { d: 'M-9 -92 L0 -128 L9 -92 Z', transform: `rotate(${i * 30})` }, '#ffc94d', 4);
  piece(sunG, 'circle', { cx: 0, cy: 0, r: 72 }, '#ffd56b', 6);
  // clouds
  const cl = svgLayer('L-clouds', 'xMidYMin slice');
  const clouds = [[120, 120, 1], [520, 210, .7], [900, 90, .9], [1250, 260, .6], [1500, 150, .8]].map(([x, y, s]) => cloud(cl, x, y, s));
  // far mountains
  const far = svgLayer('L-far');
  const mtn = 'M-60 940 L-60 560 L120 430 L260 520 L420 340 L560 470 L700 400 L860 520 L1020 360 L1180 480 L1320 380 L1480 470 L1660 410 L1660 940 Z';
  piece(far, 'path', { d: mtn }, '#b8cdea', 8);
  [[420, 340], [1020, 360], [1320, 380]].forEach(([x, y]) => el('path', { d: `M${x - 34} ${y + 40} L${x} ${y} L${x + 34} ${y + 40} L${x + 18} ${y + 32} L${x + 6} ${y + 44} L${x - 8} ${y + 32} Z`, fill: '#fffdf6' }, far));
  // mid hills + pines
  const mid = svgLayer('L-mid');
  const midD = hill(600, 40, 7);
  piece(mid, 'path', { d: midD }, '#acd590', 8);
  for (let i = 0; i < 16; i++) { const x = rnd(-20, W + 20); if (x > 560 && x < 1040) continue; pine(mid, x, groundY(midD, x) + 12, rnd(.8, 1.15), ['#6fae6a', '#5f9e62', '#7dbb6d'][i % 3]); }
  // near hills + round trees + bushes
  const near = svgLayer('L-near');
  const nearD = hill(720, 30, 6);
  piece(near, 'path', { d: nearD }, '#86c262', 8);
  [[90, 1.3], [300, 1.0], [1310, 1.05], [1520, 1.35], [1120, .8], [480, .75]].forEach(([x, s]) => roundTree(near, x, groundY(nearD, x) + 14, s, ['#5fa35a', '#79bb5f', '#4f9450']));
  for (let i = 0; i < 7; i++) { const x = rnd(0, W); bush(near, x, groundY(nearD, x) + 16, rnd(.8, 1.2), '#6aad55'); }
  // front grass strip + tufts + flowers
  const front = svgLayer('L-front');
  const frontD = hill(835, 14, 9);
  piece(front, 'path', { d: frontD }, '#9fd07a', 6);
  // clumps: a big tuft with one or two small ones beside it, irregular gaps between clumps
  for (let x = -10; x < W + 20; x += rnd(55, 140)) {
    tuft(front, x, groundY(frontD, x) + 8, rnd(.9, 1.35), ['#559a40', '#72b455']);
    for (let k = Math.floor(rnd(0, 3)); k > 0; k--) { const dx = rnd(14, 30) * (rnd() < .5 ? -1 : 1); tuft(front, x + dx, groundY(frontD, x + dx) + 8, rnd(.5, .8), ['#62a548', '#86c462']); }
  }
  for (let i = 0; i < 16; i++) { const x = rnd(0, W); if (x > 620 && x < 980) continue; flower(front, x, groundY(frontD, x) + 12, ['#f2726a', '#f8b93a', '#a57fd8', '#3fa6e0'][i % 4]); }
  const leavesSvg = svgLayer('L-leaves', 'xMidYMid slice');
  return { rays, clouds, leavesSvg, sways };
}

// ---------- the clock ----------
export function startHome(scene) {
  const home = document.getElementById('home');
  const glints = [...document.querySelectorAll('.glint')];
  const logo = document.getElementById('logo'); // bob the img, not the .pop wrapper (its transform is transitioned)
  const btn = document.getElementById('start');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const leaves = [];
  let t = 0, last = performance.now(), gustAt = 4.5, running = true, px = 0, py = 0, tx = 0, ty = 0;
  const STORY = 2.4; // stories start once the intro has landed
  const layers = ['L-far', 'L-mid', 'L-near', 'L-front', 'L-clouds'].map((id, i) => ({ svg: document.querySelector(`#${id} > svg`), depth: [4, 8, 13, 20, 6][i] }));
  addEventListener('pointermove', e => { tx = e.clientX / innerWidth - .5; ty = e.clientY / innerHeight - .5; });

  const gust = (x) => { // a gust is a bump that travels left -> right across the scene
    const k = (t - gustAt) - x / W * 1.4;
    return k < 0 || k > 2.6 ? 0 : Math.sin(Math.PI * k / 2.6) ** 2;
  };
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const live = reduce ? 0 : Math.min(1, Math.max(0, (t - STORY) / 1.2)); // ease stories in from the exact design
    if (t - gustAt > 4.2) gustAt = t + 3 + Math.random() * 5;
    for (const s of scene.sways || []) {
      const g = gust(s.x);
      const a = live * (Math.sin(t * 1.5 + s.phase) * 0.5 + Math.sin(t * 2.7 + s.phase * 2) * 0.25 + g * 2.6) * s.amp;
      s.node.setAttribute('transform', s.grass ? `translate(${s.x} ${s.y}) skewX(${a * 2.2}) translate(${-s.x} ${-s.y})` : `rotate(${a} ${s.x} ${s.y})`);
      if (s.crown) s.crown.setAttribute('transform', `translate(${a * 1.4 * s.s} 0)`);
      if (live && g > .6 && Math.random() < dt * 0.25 && leaves.length < 14 && s.crown) spawnLeaf(s);
    }
    scene.rays.setAttribute('transform', `rotate(${t * 6})`);
    for (const c of scene.clouds) { c.x += c.v * dt * (1 + gust(c.x) * 3) * live; if (c.x > W + 160) c.x = -260; c.g.setAttribute('transform', `translate(${c.x} ${c.y})`); }
    for (let i = leaves.length - 1; i >= 0; i--) {
      const L = leaves[i]; L.age += dt; L.x += (L.vx + gust(L.x) * 260) * dt; L.y += (Math.sin(L.age * 3 + L.ph) * 40 + 30) * dt; L.r += L.vr * dt;
      L.node.setAttribute('transform', `translate(${L.x} ${L.y}) rotate(${L.r})`);
      if (L.x > W + 40 || L.y > H + 40) { L.node.remove(); leaves.splice(i, 1); }
    }
    // accents: logo bob, star glints, button pulse ring + sheen
    if (live) {
      logo.style.transform = `translateY(${Math.sin(t * 2 * Math.PI / 2.8) * 3 * live}px)`;
      glints.forEach((gl, i) => { const k = ((t + i * 1.3) % 2.6) / 0.7; const s = k < 1 ? Math.sin(Math.PI * k) : 0; gl.style.transform = `translate(-50%,-50%) scale(${s * 1.1}) rotate(${t * 90}deg)`; });
      const p = (t % 2) / 2; btn.style.setProperty('--ring', p);
      label.style.transform = `scale(${1 + Math.sin(t * Math.PI) * 0.03})`;
      ring.style.opacity = (0.55 * (1 - p) * live).toFixed(3); ring.style.transform = `scale(${1 + p * 0.25})`;
      const sp = (t % 3.4) / 1.5; sheen.style.transform = `translateX(${sp < 1 ? sp * 420 : 999}%) skewX(-18deg)`;
      px += (tx - px) * dt * 3; py += (ty - py) * dt * 3;
      for (const l of layers) l.svg.style.transform = `translate(${-px * l.depth}px, ${-py * l.depth * .4}px)`;
    }
    requestAnimationFrame(frame);
  }
  // pseudo-elements can't be driven per frame, so use real nodes for ring + sheen
  const ring = Object.assign(document.createElement('i'), { className: 'ring' });
  const sheen = Object.assign(document.createElement('i'), { className: 'sheen' });
  Object.assign(ring.style, { position: 'absolute', inset: '-10px', borderRadius: '999px', border: '4px solid #8cc152', opacity: 0, pointerEvents: 'none' });
  Object.assign(sheen.style, { position: 'absolute', top: 0, bottom: 0, left: '-40%', width: '38%', background: 'linear-gradient(100deg,transparent,#ffffff60,transparent)', pointerEvents: 'none' });
  btn.style.overflow = 'visible'; const label = btn.querySelector('span'); label.style.display = 'inline-block';
  const wrap = document.createElement('span'); Object.assign(wrap.style, { position: 'absolute', inset: 0, borderRadius: '999px', overflow: 'hidden', pointerEvents: 'none' }); wrap.append(sheen); btn.append(wrap, ring);

  function spawnLeaf(s) {
    const node = el('path', { d: 'M0 -7 Q7 0 0 7 Q-7 0 0 -7 Z', fill: ['#79bb5f', '#f8b93a', '#5fa35a'][(Math.random() * 3) | 0], stroke: 'rgba(70,45,25,.25)', 'stroke-width': 1 }, scene.leavesSvg);
    leaves.push({ node, x: s.x + (Math.random() - .5) * 60, y: s.y - 90 * (s.s || 1), vx: 40 + Math.random() * 40, vr: (Math.random() - .5) * 400, r: 0, ph: Math.random() * 6, age: 0 });
  }
  requestAnimationFrame(t0 => { last = t0; home.classList.add('in'); requestAnimationFrame(frame); });
  return { stop() { running = false; } };
}

// static paper grain: rendered once to a tile, multiplied over the whole page
export function makeGrain() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); const d = x.createImageData(256, 256);
  for (let i = 0; i < d.data.length; i += 4) { const v = 200 + Math.random() * 55; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0);
  document.getElementById('grain').style.backgroundImage = `url(${c.toDataURL()})`;
}
