import { ready, paint, SCENES, blueprint } from './scenes.js';
import { ICONS, gameTags } from './icons.js';
import { GAMES, SEED_BUILD, STEPS, ART, NEW_GAME_TALK, NEW_GAME_TITLE, featureTalk, FEATURE_NAME, AGENT_ACK, BUILD_STEPS } from './data.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEMO = 'demo/index.html?shell&models=json';

const games = GAMES.map(g => ({ ...g, scene: g.id, status: 'ready' }));
const state = { screen: 'title', current: null, mode: 'edit', step: 0, picks: {}, other: {}, speed: 1 };

// ---------------- screens ----------------
function show(name) {
  state.screen = name;
  for (const s of $$('.screen')) s.hidden = s.id !== 's-' + name;
  $('#tracker').classList.toggle('hidden', name === 'title');
  $('#tracker').classList.toggle('inbar', name === 'play');
  scrollTo(0, 0);
}

// Title screen is the dungeon prototype's own home screen; its Start posts {ogm:'start'} back to us.
const titleFrame = $('#titleFrame');
function loadTitle() { titleFrame.src = DEMO; }
addEventListener('message', e => { if (e.data?.ogm === 'start' && state.screen === 'title') { show('library'); setTimeout(() => { titleFrame.src = 'about:blank'; }, 400); } });
$('#lib-back').onclick = () => { loadTitle(); show('title'); };

// ---------------- library ----------------
// The selected game owns a fixed spotlight at the top (details left, gameplay right with paint-splatter edges);
// the edge-to-edge grid below picks what it shows. Click a tile to select it, click the selected tile for the details window.
const grid = $('#lib-grid');
let selId = null;
const STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';
function stars(r) {
  return Array.from({ length: 5 }, (_, i) => {
    const f = Math.max(0, Math.min(1, (r || 0) - i)) * 100, id = `st${i}`;
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="${id}"><stop offset="${f}%" stop-color="#fabd2f"/><stop offset="${f}%" stop-color="#d5c4a1"/></linearGradient></defs><path d="${STAR}" fill="url(#${id})" stroke="#3c3836" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }).join('');
}
function tileFor(g, i) {
  const building = g.status === 'building';
  const t = h('button', 'tile' + (building ? ' building' : '') + (g.id === selId ? ' sel' : ''));
  t.dataset.id = g.id;
  t.style.setProperty('--c', g.color); t.style.setProperty('--i', i);
  t.setAttribute('aria-label', `${g.title}: ${g.tagline}`);
  t.innerHTML = `<canvas></canvas><span class="shine"></span>
    ${g.badge ? `<span class="badge">${esc(g.badge)}</span>` : ''}
    <span class="build-chip" ${building ? '' : 'hidden'}><i class="ring"></i><b class="pct">0%</b> Building</span>
    <span class="tile-info"><span class="cover-title" style="font-family:'${g.font}',var(--display);color:${g.color}">${esc(g.title)}</span>
      <span class="tile-meta"><span class="ticons">${gameTags(g).filter(x => x.kind === 'genre' || x.kind === 'vibe').slice(0, 4).map(x => `<i class="k-${x.kind}" title="${esc(x.label)}">${ICONS[x.key]}</i>`).join('')}</span><span class="stars">${g.rating ? '★ ' + g.rating : 'New'}</span></span></span>`;
  t.onclick = () => g.id === selId ? openGame(g) : select(g.id, true);
  return t;
}
// splatter-edged mask for the spotlight footage, plus coloured splats behind it (seeded per game so each looks a little different)
// Paint splatter, drawn in white for the footage mask or in colour for the paint behind it. Everything sits on the very edge:
// a ragged border (layered noise), splash lobes ringed by satellites, radial spray (stretched drops), drips running down, small bites.
function rng(seed) { let s = seed % 2147483647 || 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function blob(c, r, x, y, rad) {
  const n = 40, ph = [r() * 7, r() * 7, r() * 7];
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const t = i / n * Math.PI * 2, k = 1 + .14 * Math.sin(t * 3 + ph[0]) + .08 * Math.sin(t * 7 + ph[1]) + .05 * Math.sin(t * 13 + ph[2]) + (r() - .5) * .06;
    c.lineTo(x + Math.cos(t) * rad * k, y + Math.sin(t) * rad * k);
  }
  c.fill();
}
function drop(c, x, y, rad, ang, stretch) { c.beginPath(); c.ellipse(x, y, rad * stretch, rad, ang, 0, 7); c.fill(); }
function splatEdge(c, r, W, H, inset) {
  // border points around the inset rectangle, pushed in and out by layered noise
  const pts = [], P = 2 * (W + H - 4 * inset), ph = [r() * 7, r() * 7, r() * 7, r() * 7], spikes = [];
  for (let i = 0; i < 26; i++) spikes.push([r() * P, 10 + r() * 34, 14 + r() * 40]);
  const at = d => { const w = W - 2 * inset, h = H - 2 * inset;
    if (d < w) return [inset + d, inset, 0, -1]; d -= w; if (d < h) return [W - inset, inset + d, 1, 0]; d -= h;
    if (d < w) return [W - inset - d, H - inset, 0, 1]; d -= w; return [inset, H - inset - d, -1, 0]; };
  c.beginPath();
  for (let d = 0; d < P; d += 5) {
    const [x, y, nx, ny] = at(d), t = d / 60;
    let o = 7 * Math.sin(t * .9 + ph[0]) + 4 * Math.sin(t * 2.3 + ph[1]) + 2.5 * Math.sin(t * 5.1 + ph[2]) + 1.5 * Math.sin(t * 11 + ph[3]) + (r() - .5) * 3;
    for (const [sd, sw, sh] of spikes) { const dd = Math.abs(d - sd); if (dd < sw) o += sh * (1 - dd / sw) ** 2; }
    c.lineTo(x + nx * o, y + ny * o); pts.push([x, y, nx, ny]);
  }
  c.closePath(); c.fill();
  // splash lobes with satellites
  for (const [sd, , sh] of spikes) {
    const [x, y, nx, ny] = at(sd); if (r() < .4) continue;
    const cx = x + nx * sh * .8, cy = y + ny * sh * .8; blob(c, r, cx, cy, 8 + r() * 16);
    for (let k = 0; k < 10; k++) { const a = Math.atan2(ny, nx) + (r() - .5) * 2.2, d = 18 + r() * 40; drop(c, cx + Math.cos(a) * d, cy + Math.sin(a) * d, .8 + r() * 4, a, 1 + r() * 1.8); }
  }
  // radial spray: many small drops just outside the edge, stretched outward, smaller the farther they fly
  for (let i = 0; i < 900; i++) {
    const [x, y, nx, ny] = pts[Math.floor(r() * pts.length)], f = r() ** 1.7, d = 4 + f * inset * 1.15, a = Math.atan2(ny, nx) + (r() - .5) * .9;
    drop(c, x + Math.cos(a) * d + (ny ? (r() - .5) * 8 : 0), y + Math.sin(a) * d + (nx ? (r() - .5) * 8 : 0), .5 + (1 - f) ** 3 * 5 * r(), a, 1 + r() * 2.2);
  }
  // drips: paint runs down from the bottom edge and from lobes on the sides
  for (let i = 0; i < 9; i++) {
    const x = inset + r() * (W - 2 * inset), w = 3 + r() * 6, len = 18 + r() ** 1.5 * inset * 1.6, y0 = H - inset - 6;
    c.beginPath(); c.moveTo(x - w, y0); c.quadraticCurveTo(x - w * .6, y0 + len * .6, x - w * .45, y0 + len); c.lineTo(x + w * .45, y0 + len); c.quadraticCurveTo(x + w * .6, y0 + len * .6, x + w, y0); c.fill();
    drop(c, x, y0 + len, w * .8, Math.PI / 2, 1.25);
  }
  for (let i = 0; i < 4; i++) {
    const side = r() < .5, x = side ? inset * (.55 + r() * .3) : W - inset * (.55 + r() * .3), y = inset + r() * (H * .6), len = 20 + r() * 60, w = 2 + r() * 3;
    c.fillRect(x - w / 2, y, w, len); drop(c, x, y + len, w * .9, Math.PI / 2, 1.3);
  }
}
function splatMask(seed, W = 1600, H = 900) {
  const r = rng(seed), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d'); c.fillStyle = '#fff'; splatEdge(c, r, W, H, W * .045);
  c.globalCompositeOperation = 'destination-out';   // small bites just inside the edge
  for (let i = 0; i < 60; i++) { const s = Math.floor(r() * 4), u = r(), m = W * .045 + r() * 14;
    const x = s < 2 ? W * u : s === 2 ? m : W - m, y = s >= 2 ? H * u : s === 0 ? m : H - m; drop(c, x, y, 2 + r() * 7, r() * 3, 1 + r()); }
  return cv.toDataURL();
}
function splatBack(cv, seed, color) {
  const W = cv.width = cv.clientWidth * 2, H = cv.height = cv.clientHeight * 2, c = cv.getContext('2d'), r = rng(seed + 11);
  const cols = [color, color, '#83a598', '#d3869b', '#fe8019'];
  for (let k = 0; k < 6; k++) {   // coloured splashes that peek out from behind the footage edge
    c.fillStyle = cols[Math.floor(r() * cols.length)];
    const a = r() * Math.PI * 2, x = W / 2 + Math.cos(a) * W * .43, y = H / 2 + Math.sin(a) * H * .41;
    blob(c, r, x, y, W * (.03 + r() * .035));
    for (let i = 0; i < 70; i++) { const t = a + (r() - .5) * 2.4, d = W * (.03 + r() ** 1.5 * .09); drop(c, x + Math.cos(t) * d, y + Math.sin(t) * d, 1 + r() ** 3 * 9, t, 1 + r() * 2); }
  }
}
const seedOf = id => [...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 2147483647, 7) || 7;
function select(id, scroll) {
  selId = id;
  const g = games.find(x => x.id === id), building = g.status === 'building';
  for (const t of $$('.tile', grid)) t.classList.toggle('sel', t.dataset.id === id);
  const hero = $('#lib-hero');
  hero.style.setProperty('--c', g.color);
  $('#lh-text').innerHTML = `
    ${g.badge ? `<span class="lh-badge">${esc(g.badge)}</span>` : ''}
    <h2 class="lh-title" style="font-family:'${g.font}',var(--display)">${esc(g.title)}</h2>
    <p class="lh-tag">${esc(g.tagline)}</p>
    <p class="lh-desc">${esc(g.desc)}</p>
    <ul class="lh-icons">${gameTags(g).map(x => `<li class="k-${x.kind}"><span>${ICONS[x.key]}</span>${esc(x.label)}</li>`).join('')}</ul>
    <dl class="lh-stats">
      <div><dt>Time played</dt><dd>${esc(g.played || '0m')}</dd></div>
      <div><dt>Rating</dt><dd class="lh-stars" aria-label="${g.rating ? g.rating + ' out of 5' : 'Not rated yet'}">${stars(g.rating)}<small>${g.rating ? g.rating : 'New'}</small></dd></div>
      <div><dt>Version</dt><dd>v${esc(g.version)}</dd></div>
      <div><dt>Plays</dt><dd>${esc(g.plays)}</dd></div>
    </dl>
    <div class="lh-acts">
      <button class="act play" ${building ? 'disabled' : ''}>▶ Play</button>
      <button class="act edit" ${building ? 'disabled' : ''}>✎ Edit</button>
      <button class="act more">Details</button>
    </div>`;
  $('#lh-text .act.play').onclick = () => enterGame(g, 'play');
  $('#lh-text .act.edit').onclick = () => enterGame(g, 'edit');
  $('#lh-text .act.more').onclick = () => openGame(g);
  const seed = seedOf(g.id), shot = $('#lh-shot');
  shot.style.maskImage = shot.style.webkitMaskImage = `url(${splatMask(seed)})`;
  splatBack($('#lh-splat'), seed, g.color);
  for (const el of [$('#lh-text'), $('#lh-media')]) { el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); }
  drawHero(performance.now());
  if (scroll && hero.getBoundingClientRect().bottom < 120) scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
}
function drawHero(now) {
  const g = games.find(x => x.id === selId), cv = $('#lh-canvas');
  if (!g) return;
  if (g.status === 'building') { cv.width = 320; cv.height = 180; blueprint(cv.getContext('2d'), now / 1000, 320, 180, jobFor(g.id)?.p || 0); }
  else paint(cv, g.scene, 0, (SCENES[g.scene].cover?.[1] || 0) + (reduced ? 0 : now / 1000 % 60));
  const amb = $('#lh-ambient'); if (cv.width) { amb.width = 48; amb.height = 27; amb.getContext('2d').drawImage(cv, 0, 0, 48, 27); }
}
function renderLibrary() {
  if (!selId || !games.some(g => g.id === selId)) selId = games[0].id;
  grid.innerHTML = '';
  games.forEach((g, i) => grid.append(tileFor(g, i)));
  $('#lib-count').textContent = `${games.length} games`;
  drawCovers();
  for (const t of $$('.tile', grid)) seen.observe(t);
  select(selId, false);
}
function drawCovers() {
  for (const t of $$('.tile', grid)) {
    const g = games.find(x => x.id === t.dataset.id), cv = $('canvas', t);
    if (g.status === 'building') { cv.width = 320; cv.height = 180; blueprint(cv.getContext('2d'), performance.now() / 1000, 320, 180, jobFor(g.id)?.p || 0); }
    else { const [si, ct] = SCENES[g.scene].cover || [0, 1]; paint(cv, g.scene, si, ct); }
  }
}
// arrows browse, Enter plays the selected game
addEventListener('keydown', e => {
  if (state.screen !== 'library' || !gm.hidden || e.target.closest('input, textarea')) return;
  const i = games.findIndex(g => g.id === selId);
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const n = games[(i + (e.key === 'ArrowRight' ? 1 : -1) + games.length) % games.length]; select(n.id, false); $(`.tile[data-id="${n.id}"]`, grid)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  if (e.key === 'Enter' && e.target === document.body && games[i].status !== 'building') enterGame(games[i], 'play');
});
// Every cover on screen plays all the time; building tiles animate their blueprint.
const onScreen = new Set();
const seen = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? onScreen.add(e.target) : onScreen.delete(e.target)));
function libraryLoop(now) {
  if (state.screen === 'library' && !reduced) {
    drawHero(now);
    for (const t of onScreen) {
      if (!t.isConnected) { onScreen.delete(t); continue; }
      const cv = $('canvas', t), g = games.find(x => x.id === t.dataset.id);
      if (t.classList.contains('building')) blueprint(cv.getContext('2d'), now / 1000, 320, 180, jobFor(t.dataset.id)?.p || 0);
      else paint(cv, g.scene, 0, (SCENES[g.scene].cover?.[1] || 0) + now / 1000 % 60);
    }
  }
  requestAnimationFrame(libraryLoop);
}
$('#new-game').onclick = () => startWizard();

// ---------------- game modal ----------------
const gm = $('#game-modal');
let montage = null;
function openGame(g) {
  state.current = g;
  const building = g.status === 'building';
  $('#gm-title').textContent = g.title;
  $('#gm-title').style.fontFamily = `'${g.font}', var(--display)`;
  $('#gm-by').textContent = '@' + g.by;
  $('#gm-tag').textContent = g.tagline;
  $('#gm-desc').textContent = g.desc;
  const row = (k, v) => `<div class="kv"><dt>${k}</dt><dd>${v}</dd></div>`;
  const chips = a => a.map(x => `<span class="chip">${esc(x)}</span>`).join('');
  $('#gm-facts').innerHTML = row('Genre', chips(g.genres)) + row('Vibe', chips(g.vibe)) + row('Art style', chips([g.art])) + row('Players', esc(g.players))
    + row('World', esc(g.world)) + row('Controls', esc(g.controls))
    + row('Rating', g.rating ? `<span class="stars-big">${'★'.repeat(Math.round(g.rating))}${'☆'.repeat(5 - Math.round(g.rating))}</span> ${g.rating} <small>(${g.votes})</small>` : 'Not rated yet')
    + row('Plays', esc(g.plays)) + row('Updated', `${esc(g.updated)} · v${esc(g.version)}`) + row('Made with', esc(g.packs.join(', ')));
  $('#gm-play').disabled = $('#gm-edit').disabled = building;
  $('#gm-building').hidden = !building;
  const thumbs = $('#gm-thumbs'); thumbs.innerHTML = '';
  const n = building ? 1 : SCENES[g.scene].scenes.length;
  for (let i = 0; i < n; i++) {
    const b = h('button', 'thumb'); b.innerHTML = `<canvas></canvas><span>${esc(building ? 'Blueprint' : g.labels[i] || 'Scene ' + (i + 1))}</span>`;
    if (building) { const cv = $('canvas', b); cv.width = 320; cv.height = 180; blueprint(cv.getContext('2d'), 0, 320, 180, jobFor(g.id)?.p || 0); }
    else paint($('canvas', b), g.scene, i, 1.5);
    b.onclick = () => { montage.scene = i; montage.t0 = performance.now(); };
    thumbs.append(b);
  }
  montage = { g, scene: 0, t0: performance.now(), start: performance.now(), n };
  gm.hidden = false; document.body.classList.add('modal-open');
  $('#gm-close').focus();
}
function closeGame() { gm.hidden = true; montage = null; document.body.classList.remove('modal-open'); }
$('#gm-close').onclick = closeGame;
gm.addEventListener('click', e => { if (e.target === gm) closeGame(); });
addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#voice-modal').hidden) closeVoice(); else if (!$('#art-pop').hidden) closeArtPop(); else if (!gm.hidden) closeGame(); } });
const SCENE_LEN = 3.6;
function montageLoop(now) {
  if (montage) {
    const m = montage, cv = $('#gm-video'), el = (now - m.t0) / 1000;
    if (el > SCENE_LEN) { m.scene = (m.scene + 1) % m.n; m.t0 = now; }
    const t = (now - m.start) / 1000;
    if (m.g.status === 'building') { cv.width = 320; cv.height = 180; blueprint(cv.getContext('2d'), t, 320, 180, jobFor(m.g.id)?.p || 0); }
    else paint(cv, m.g.scene, m.scene, (SCENES[m.g.scene].cover?.[1] || 0) + (reduced ? 0 : t));
    const cut = (now - m.t0) / 1000; $('#gm-flash').style.opacity = cut < .18 ? String(1 - cut / .18) : '0';
    $('#gm-scene').textContent = m.g.status === 'building' ? 'Blueprint' : (m.g.labels[m.scene] || '');
    $('#gm-progress').style.width = `${(m.scene + Math.min(1, el / SCENE_LEN)) / m.n * 100}%`;
    $$('#gm-thumbs .thumb').forEach((b, i) => b.classList.toggle('on', i === m.scene));
  }
  requestAnimationFrame(montageLoop);
}
$('#gm-play').onclick = () => enterGame(state.current, 'play');
$('#gm-edit').onclick = () => enterGame(state.current, 'edit');

// ---------------- play / edit (the dungeon prototype) ----------------
const gameFrame = $('#gameFrame');
function enterGame(g, mode) {
  closeGame(); state.current = g; state.mode = mode;
  $('#pb-title').textContent = g.title;
  setModeButtons(mode);
  gameFrame.src = `${DEMO}&editor&title=${encodeURIComponent(g.title)}${mode === 'play' ? '&play' : ''}`;
  show('play');
}
function setModeButtons(mode) { $$('#pb-mode button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode))); }
$$('#pb-mode button').forEach(b => b.onclick = () => { state.mode = b.dataset.mode; setModeButtons(state.mode); gameFrame.contentWindow?.postMessage({ ogm: state.mode }, '*'); });
$('#pb-back').onclick = () => { gameFrame.src = 'about:blank'; show('library'); renderLibrary(); };
$('#pb-ask').onclick = () => {
  gameFrame.contentWindow?.postMessage({ ogm: 'edit' }, '*'); state.mode = 'edit'; setModeButtons('edit');
  openVoice({ twoWay: true, title: `Change ${state.current.title}`, turns: featureTalk(state.current.title), finish: 'Finish',
    onFinish: () => loadingThen('Sending your change to the builder', () => addJob('feature', `${state.current.title} · ${FEATURE_NAME}`, state.current.id)) });
};

// ---------------- New Game wizard ----------------
function startWizard() { state.step = 0; state.picks = {}; state.other = {}; show('wizard'); renderStep(); }
$('#wz-back').onclick = () => { if (talk) { talk.stop(); talk = null; } if (state.step === 0) show('library'); else { state.step--; renderStep(); } };
$('#wz-next').onclick = () => { if (state.step < STEPS.length - 1) { state.step++; renderStep(); } };
let talk = null;
function renderStep() {
  const st = STEPS[state.step];
  closeArtPop();
  $('#wz-title').textContent = st.title;
  $('#wz-ask').textContent = st.ask;
  $('#wz-hint').textContent = st.hint;
  $('#wz-dots').innerHTML = STEPS.map((s, i) => `<i class="${i < state.step ? 'done' : i === state.step ? 'now' : ''}" title="${esc(s.title)}"></i>`).join('');
  $('#wz-dots').setAttribute('aria-label', `Step ${state.step + 1} of ${STEPS.length}`);
  const body = $('#wz-body'); body.innerHTML = ''; body.dataset.step = st.key;
  $('#wz-next').hidden = st.key === 'talk';
  if (st.key === 'talk') return renderTalk(body);
  const g = h('div', 'opt-grid'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', st.ask);
  const picks = state.picks[st.key] ||= new Set();
  for (const op of st.opts) {
    const b = h('button', 'opt', `<span class="ic">${ICONS[op.icon]}</span><span class="lb">${esc(op.label)}</span>`);
    b.dataset.id = op.id; b.setAttribute('aria-pressed', String(picks.has(op.id)));
    b.onclick = () => togglePick(st, op, b);
    g.append(b);
  }
  g.append(otherTile(st));
  body.append(g);
  updateLimit(st);
  updateNext();
}
function togglePick(st, op, b) {
  const picks = state.picks[st.key];
  if (picks.has(op.id)) { picks.delete(op.id); b.setAttribute('aria-pressed', 'false'); if (st.preview) closeArtPop(); }
  else {
    if (countPicks(st) >= st.max) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); toast(`${st.hint.split('·')[0].trim()}. Unpick one first.`); return; }
    picks.add(op.id); b.setAttribute('aria-pressed', 'true'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    if (st.preview) openArtPop(op, b);
  }
  updateLimit(st); updateNext();
}
const countPicks = st => (state.picks[st.key]?.size || 0) + (state.other[st.key] ? 1 : 0);
function updateLimit(st) { $('.opt-grid')?.classList.toggle('full', countPicks(st) >= st.max); }
function updateNext() { const st = STEPS[state.step]; $('#wz-next').textContent = countPicks(st) ? 'Next' : 'Skip'; }

// "Other": flips into a pencil (type) and a speaker (say it); either one fills the tile with the answer.
function otherTile(st) {
  const wrap = h('div', 'opt other');
  const val = state.other[st.key];
  const draw = () => {
    const v = state.other[st.key];
    if (v) {
      wrap.className = 'opt other filled'; wrap.setAttribute('aria-pressed', 'true');
      wrap.innerHTML = `<span class="other-text">“${esc(v)}”</span><span class="other-acts"><button class="mini" data-a="type" aria-label="Edit">${ICONS.pencil}</button><button class="mini" data-a="clear" aria-label="Remove">✕</button></span>`;
    } else {
      wrap.className = 'opt other'; wrap.removeAttribute('aria-pressed');
      wrap.innerHTML = `<button class="other-face" data-a="flip"><span class="ic">${ICONS.other}</span><span class="lb">Other</span></button>
        <div class="other-pick" hidden><button data-a="type" aria-label="Type it">${ICONS.pencil}<span>Type</span></button><button data-a="voice" aria-label="Say it">${ICONS.speak}<span>Say it</span></button></div>`;
    }
  };
  wrap.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'flip') { $('.other-face', wrap).hidden = true; $('.other-pick', wrap).hidden = false; wrap.classList.add('flipped'); }
    if (a === 'clear') { delete state.other[st.key]; draw(); updateLimit(st); updateNext(); }
    if (a === 'type') {
      if (!state.other[st.key] && countPicks(st) >= st.max) return toast('Unpick one first.');
      wrap.className = 'opt other typing';
      wrap.innerHTML = `<form class="other-form"><label class="sr" for="other-${st.key}">Your own ${esc(st.title.toLowerCase())}</label><textarea id="other-${st.key}" rows="3" placeholder="Describe it…">${esc(state.other[st.key] || '')}</textarea><button class="btn small green">Add</button></form>`;
      const ta = $('textarea', wrap); ta.focus();
      const save = ev => { ev?.preventDefault(); const v = ta.value.trim(); if (v) state.other[st.key] = v; else delete state.other[st.key]; draw(); updateLimit(st); updateNext(); };
      $('form', wrap).onsubmit = save; ta.onkeydown = ev => { if (ev.key === 'Enter' && !ev.shiftKey) save(ev); };
    }
    if (a === 'voice') {
      if (countPicks(st) >= st.max) return toast('Unpick one first.');
      openVoice({ twoWay: false, title: `Describe your ${st.title.toLowerCase()}`, turns: [{ who: 'you', text: st.voice }], finish: 'Use this',
        onFinish: text => { state.other[st.key] = text; draw(); updateLimit(st); updateNext(); } });
    }
  });
  if (val) draw(); else draw();
  return wrap;
}

// Art style popover: what the style looks like, using previews of packs we already own.
const pop = $('#art-pop');
function openArtPop(op, anchor) {
  const a = ART[op.id];
  pop.innerHTML = `<div class="pop-head"><span class="ic">${ICONS[op.icon]}</span><div><h3>${esc(op.label)}</h3><p>${esc(a.blurb)}</p></div><button class="x" aria-label="Close">✕</button></div>
    <div class="pop-strip">${a.packs.map(([id, name]) => `<figure><img src="art/packs/${id}.webp" alt="${esc(name)} preview" loading="lazy"><figcaption>${esc(name)}</figcaption></figure>`).join('')}</div>
    <p class="pop-foot"><b>${a.count} packs</b> in your library use this style · ${a.synty ? 'Synty (licensed, private use)' : 'Kenney (CC0)'}</p>`;
  pop.hidden = false;
  const r = anchor.getBoundingClientRect(), pw = Math.min(460, innerWidth - 24);
  pop.style.width = pw + 'px';
  if (innerWidth < 640) { pop.classList.add('sheet'); pop.style.left = pop.style.top = ''; }
  else {
    pop.classList.remove('sheet');
    const left = Math.max(12, Math.min(innerWidth - pw - 12, r.left + r.width / 2 - pw / 2));
    const below = r.bottom + 12 + 330 < innerHeight;
    pop.style.left = left + 'px'; pop.style.top = (below ? r.bottom + 10 : Math.max(12, r.top - pop.offsetHeight - 10)) + scrollY + 'px';
  }
  $('.x', pop).onclick = closeArtPop;
}
function closeArtPop() { pop.hidden = true; }
document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.opt')) closeArtPop(); });

// Final step: two-way conversation with the builder, embedded in the page.
function renderTalk(body) {
  const sum = h('div', 'pick-sum');
  const names = [];
  for (const st of STEPS.slice(0, -1)) {
    const set = state.picks[st.key]; const labels = st.opts.filter(o => set?.has(o.id)).map(o => o.label);
    if (state.other[st.key]) labels.push('“' + state.other[st.key] + '”');
    if (labels.length) names.push(`<span class="sum-k">${esc(st.title)}</span> ${labels.map(l => `<span class="chip">${esc(l)}</span>`).join('')}`);
  }
  sum.innerHTML = names.length ? names.map(n => `<span class="sum-row">${n}</span>`).join('') : '<span class="sum-row muted">No picks yet. That is fine: just tell the builder about your game.</span>';
  body.append(sum);
  const host = h('div', 'talk-host'); body.append(host);
  talk = new VoiceSession(host, { twoWay: true, turns: NEW_GAME_TALK, finish: 'Finish', embedded: true,
    onFinish: () => { const title = talk.usedScript ? NEW_GAME_TITLE : titleFrom(talk.typed) ; talk.stop(); talk = null; loadingThen('Handing your game to the builder', () => createGame(title)); } });
}
const titleFrom = s => (s || 'New game').split(/\s+/).slice(0, 3).map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ').replace(/[.,!?]/g, '') || 'New game';

function createGame(title) {
  const art = [...(state.picks.art || [])][0];
  const label = id => STEPS.flatMap(s => s.opts || []).find(o => o.id === id)?.label;
  const genres = [...(state.picks.genre || [])].map(label); const vibe = [...(state.picks.vibe || [])].map(label);
  const scene = { bit1: 'lantern-hollow', bit8: 'mossy-leap', bit16: 'restorebound', cartoon: 'nebula-run', sketch: 'mossy-leap' }[art] || 'goblin-cellar';
  const id = 'new-' + Date.now();
  const g = { id, title, by: 'you', font: 'Lilita One', color: '#fabd2f', badge: 'Yours', tagline: 'A night-shift baker delivers bread across floating islands.',
    genres: genres.length ? genres : ['Adventure'], vibe: vibe.length ? vibe : ['Cozy'], art: label(art) || '16-bit pixel',
    players: [...(state.picks.players || [])].map(label).join(' · ') || 'Single player', world: [...(state.picks.world || [])].map(label).join(' · ') || 'Sky islands',
    controls: 'Keyboard · Touch', rating: null, votes: '', plays: '0', updated: 'Building', version: '0.1.0', played: '0m', packs: [ART[art]?.packs[0]?.[1] ? 'Kenney ' + ART[art].packs[0][1] : 'Kenney Tiny Town'],
    labels: ['First run', 'Islands'], desc: 'Built from your picks and your conversation with the builder. In this prototype it plays in Goblin Cellar.', scene, status: 'building' };
  games.unshift(g);
  addJob('game', title, id);
  show('library'); renderLibrary();
  const t = $(`.tile[data-id="${id}"]`, grid); t?.classList.add('fresh');
}

// ---------------- voice session (one-way or two-way) ----------------
class VoiceSession {
  constructor(host, opts) {
    this.o = opts; this.turn = 0; this.typed = ''; this.usedScript = false; this.alive = true; this.amp = 0; this.target = 0; this.agentAmp = 0; this.agentState = 'idle';
    this.buf = new Float32Array(240);
    host.innerHTML = `
      <div class="vs ${opts.twoWay ? 'two' : 'one'}">
        <section class="vs-side you" aria-label="You">
          <header><span class="who">You</span><span class="state" aria-live="polite">Ready</span></header>
          <canvas class="seis" aria-hidden="true"></canvas>
          <div class="caption" aria-live="polite"></div>
        </section>
        ${opts.twoWay ? `<section class="vs-side agent" aria-label="Builder">
          <header><span class="who">Builder</span><span class="state" aria-live="polite">Waiting</span></header>
          <canvas class="orb" aria-hidden="true"></canvas>
          <div class="caption" aria-live="polite"></div>
        </section>` : ''}
        <form class="vs-type" hidden><label class="sr" for="vs-ta">Type instead</label><textarea id="vs-ta" rows="2" placeholder="Type instead…"></textarea><button class="btn small">Send</button></form>
        <footer class="vs-controls">
          <button class="btn mic" type="button" aria-pressed="false"><span class="ic">${ICONS.mic}</span><span class="t">Start talking</span></button>
          <button class="btn ghost typebtn" type="button"><span class="ic">${ICONS.pencil}</span>Type instead</button>
          <span class="grow"></span>
          <button class="btn green finish" type="button" ${opts.twoWay ? '' : 'disabled'}>${esc(opts.finish)}</button>
        </footer>
      </div>`;
    this.el = $('.vs', host);
    this.cap = $('.you .caption', this.el); this.acap = $('.agent .caption', this.el);
    this.seis = $('.seis', this.el); this.orb = $('.orb', this.el);
    $('.mic', this.el).onclick = () => this.toggleMic();
    $('.typebtn', this.el).onclick = () => { const f = $('.vs-type', this.el); f.hidden = !f.hidden; if (!f.hidden) $('textarea', f).focus(); };
    $('.vs-type', this.el).onsubmit = e => { e.preventDefault(); this.sendTyped(); };
    $('.vs-type textarea', this.el).onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendTyped(); } };
    $('.finish', this.el).onclick = () => this.finish();
    this.raf = requestAnimationFrame(this.frame.bind(this));
    if (!opts.embedded) setTimeout(() => this.alive && this.toggleMic(), 500);
  }
  setState(side, txt) { const e = $(`.${side} .state`, this.el); if (e) e.textContent = txt; }
  toggleMic() {
    const b = $('.mic', this.el);
    if (this.running) { this.running = false; b.setAttribute('aria-pressed', 'false'); $('.t', b).textContent = 'Resume'; this.setState('you', 'Paused'); return; }
    this.running = true; b.setAttribute('aria-pressed', 'true'); $('.t', b).textContent = 'Pause'; this.usedScript = true;
    if (!this.busy) this.next();
  }
  async next() {
    const turns = this.o.turns;
    while (this.alive && this.running && this.turn < turns.length) {
      this.busy = true;
      const tn = turns[this.turn];
      if (tn.who === 'you') await this.speakYou(tn.text); else await this.speakAgent(tn.text);
      this.turn++;
    }
    this.busy = false;
    if (this.turn >= turns.length && this.alive) {
      this.setState('you', this.o.twoWay ? 'Listening…' : 'Done');
      if (!this.o.twoWay) { $('.finish', this.el).disabled = false; $('.mic', this.el).hidden = true; }
      $('.finish', this.el).classList.add('glow');
    }
  }
  line(cap, who) { const p = h('p', 'line ' + who); cap.append(p); cap.scrollTop = cap.scrollHeight; return p; }
  async words(p, text, ms, onWord, pausable) {
    const ws = text.split(' ');
    for (let i = 0; i < ws.length; i++) {
      while (pausable && this.alive && !this.running) await wait(120);
      if (!this.alive) return;
      p.textContent += (i ? ' ' : '') + ws[i]; p.parentElement.scrollTop = p.parentElement.scrollHeight;
      onWord(ws[i]); await wait(reduced ? 40 : ms * (0.7 + Math.random() * .6) + (/[.,?!]$/.test(ws[i]) ? 220 : 0));
    }
  }
  async speakYou(text) {
    this.setState('you', 'Listening…'); if (this.o.twoWay) this.setState('agent', 'Listening');
    for (const p of $$('.line', this.el)) p.classList.add('old');
    const p = this.line(this.o.twoWay ? this.cap : this.cap, 'you');
    await this.words(p, text, 230, w => { this.target = .45 + Math.min(.55, w.length / 12) * Math.random() + .15; setTimeout(() => this.target = .08, 140); }, true);
    this.target = .03; this.setState('you', this.o.twoWay ? 'Waiting' : 'Got it');
    this.lastYou = text;
    await wait(500);
  }
  async speakAgent(text) {
    this.agentState = 'think'; this.setState('agent', 'Thinking…'); await wait(reduced ? 100 : 1000);
    this.agentState = 'talk'; this.setState('agent', 'Speaking');
    for (const p of $$('.line', this.el)) p.classList.add('old');
    const p = this.line(this.acap, 'agent');
    await this.words(p, text, 190, w => { this.agentAmp = .5 + Math.random() * .5; });
    this.agentState = 'idle'; this.setState('agent', 'Waiting'); await wait(400);
  }
  async sendTyped() {
    const ta = $('.vs-type textarea', this.el), v = ta.value.trim(); if (!v) return; ta.value = '';
    this.typed += (this.typed ? ' ' : '') + v;
    for (const p of $$('.line', this.el)) p.classList.add('old');
    const p = this.line(this.cap, 'you typed'); p.textContent = v;
    if (!this.o.twoWay) { $('.finish', this.el).disabled = false; $('.finish', this.el).classList.add('glow'); this.lastYou = v; return; }
    $('.finish', this.el).classList.add('glow');
    const next = this.o.turns[this.turn];
    if (this.running && next?.who === 'agent') return;
    await this.speakAgent(AGENT_ACK[(this.ack = (this.ack || 0) + 1) % AGENT_ACK.length]);
  }
  finish() { const text = this.typed || this.lastYou || ''; const cb = this.o.onFinish; this.stop(); cb(text); }
  stop() { this.alive = false; this.running = false; cancelAnimationFrame(this.raf); }
  frame(now) {
    if (!this.alive) return;
    this.amp += (this.target - this.amp) * .25;
    this.buf.copyWithin(0, 1); this.buf[this.buf.length - 1] = (Math.random() * 2 - 1) * (this.amp + .02) + Math.sin(now / 37) * this.amp * .3;
    drawSeis(this.seis, this.buf, this.running);
    if (this.orb) { this.agentAmp *= .9; drawOrb(this.orb, now / 1000, this.agentState, this.agentAmp); }
    this.raf = requestAnimationFrame(this.frame.bind(this));
  }
}
const wait = ms => new Promise(r => setTimeout(r, ms));
function fit(cv) { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); const w = Math.max(1, Math.round(r.width * d)), hh = Math.max(1, Math.round(r.height * d)); if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; } return [w, hh, d]; }
// Seismograph: paper strip with a grid, ink trace scrolling left, a pen at the right edge.
function drawSeis(cv, buf, live) {
  const [W, H, d] = fit(cv), c = cv.getContext('2d');
  c.fillStyle = '#fbf1c7'; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(69,133,136,.18)'; c.lineWidth = 1;
  for (let x = 0; x < W; x += 16 * d) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = H / 2 % (16 * d); y < H; y += 16 * d) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  c.strokeStyle = 'rgba(204,36,29,.35)'; c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke();
  c.strokeStyle = '#3c3836'; c.lineWidth = 2 * d; c.lineJoin = 'round'; c.beginPath();
  const n = buf.length, pen = W - 18 * d;
  for (let i = 0; i < n; i++) { const x = pen * i / (n - 1), y = H / 2 - buf[i] * H * .42; i ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.stroke();
  const py = H / 2 - buf[n - 1] * H * .42;
  c.fillStyle = live ? '#cc241d' : '#7c6f64'; c.beginPath(); c.arc(pen, py, 5 * d, 0, 7); c.fill();
}
// Builder orb: overlapping paint blobs that breathe when idle, orbit when thinking and burst when speaking.
function drawOrb(cv, t, st, amp) {
  const [W, H, d] = fit(cv), c = cv.getContext('2d');
  c.fillStyle = '#282828'; c.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2, base = Math.min(W, H) * .22;
  const cols = ['#fe8019', '#fabd2f', '#d3869b', '#8ec07c'];
  c.globalCompositeOperation = 'lighter';
  cols.forEach((col, i) => {
    const a = t * (st === 'think' ? 2.4 : .6) + i * 1.57, wob = st === 'talk' ? amp * base * .6 : st === 'think' ? base * .25 : Math.sin(t * 1.4 + i) * base * .06;
    const r = base * (st === 'think' ? .55 : .8 + amp * .5) + Math.sin(t * 3 + i) * 2 * d;
    const x = cx + Math.cos(a) * (st === 'think' ? base * .9 : wob), y = cy + Math.sin(a) * (st === 'think' ? base * .9 : wob);
    const g = c.createRadialGradient(x, y, 0, x, y, r * 1.4); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 1.4, 0, 7); c.fill();
  });
  c.globalCompositeOperation = 'source-over';
  if (st === 'talk') { c.strokeStyle = `rgba(251,241,199,${.25 + amp * .4})`; c.lineWidth = 2 * d; for (let k = 1; k <= 3; k++) { c.beginPath(); c.arc(cx, cy, base * (1.2 + k * .35 + amp * .3), 0, 7); c.stroke(); } }
}

// Voice modal wrapper (used by Other and Ask for a change).
let modalSession = null;
function openVoice(opts) {
  const m = $('#voice-modal');
  $('#vm-title').textContent = opts.title;
  m.hidden = false; document.body.classList.add('modal-open');
  modalSession = new VoiceSession($('#vm-body'), { ...opts, onFinish: text => { closeVoice(); opts.onFinish(text); } });
}
function closeVoice() { modalSession?.stop(); modalSession = null; $('#voice-modal').hidden = true; if (gm.hidden) document.body.classList.remove('modal-open'); }
$('#vm-close').onclick = closeVoice;

// "Three dots" hand-off, then the build starts.
function loadingThen(text, fn) {
  const l = $('#loading'); $('#ld-text').textContent = text + '…'; l.hidden = false;
  setTimeout(() => { l.hidden = true; fn(); }, reduced ? 300 : 2200);
}

// ---------------- builds + progress tracker ----------------
const jobs = [];
const jobFor = gid => jobs.find(j => j.gameId === gid && !j.done);
function addJob(kind, name, gameId, elapsed = 0) {
  const dur = kind === 'game' ? 300 : 60;
  jobs.push({ id: Math.random().toString(36).slice(2), kind, name, gameId, dur, elapsed, p: elapsed / dur, done: false, steps: BUILD_STEPS[kind] });
  renderTracker(); pulseTracker();
}
const tr = $('#tracker');
$('#tr-fab').onclick = () => { tr.dataset.state = tr.dataset.state === 'collapsed' ? 'open' : 'collapsed'; renderTracker(); };
$('#tr-sum').onclick = () => { tr.dataset.state = tr.dataset.state === 'expanded' ? 'open' : 'expanded'; renderTracker(); };
$$('#tr-speed button').forEach(b => b.onclick = () => { state.speed = +b.dataset.s; $$('#tr-speed button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
function pulseTracker() { tr.classList.remove('ping'); void tr.offsetWidth; tr.classList.add('ping'); if (tr.dataset.state === 'collapsed') { tr.dataset.state = 'open'; renderTracker(); setTimeout(() => { if (tr.dataset.state === 'open') { tr.dataset.state = 'collapsed'; renderTracker(); } }, 4000); } }
const fmt = s => s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${Math.ceil(s)}s`;
function renderTracker() {
  const active = jobs.filter(j => !j.done);
  const tot = active.reduce((a, j) => a + j.dur, 0), el = active.reduce((a, j) => a + j.elapsed, 0);
  const p = tot ? el / tot : 1, left = active.reduce((a, j) => Math.max(a, (j.dur - j.elapsed) / state.speed), 0);
  tr.hidden = !jobs.length;
  $('#tr-ring').style.strokeDashoffset = String(113 * (1 - p));
  $('#tr-count').textContent = active.length || '✓';
  $('#tr-fab').setAttribute('aria-label', active.length ? `${active.length} builds running, ${Math.round(p * 100)}% done. Show progress` : 'All builds done');
  $('#tr-fab').classList.toggle('idle', !active.length);
  $('#tr-sum-label').textContent = active.length ? `${active.length} build${active.length > 1 ? 's' : ''} · about ${fmt(left)} left` : 'All builds done';
  $('#tr-sum-bar').style.width = `${p * 100}%`;
  $('#tr-sum-pct').textContent = `${Math.round(p * 100)}%`;
  $('#tr-sum').setAttribute('aria-expanded', String(tr.dataset.state === 'expanded'));
  $('#tr-chev').textContent = tr.dataset.state === 'expanded' ? 'Hide builds ▴' : 'Show each build ▾';
  const list = $('#tr-list');
  list.innerHTML = jobs.map(j => {
    const step = j.steps[Math.min(j.steps.length - 1, Math.floor(j.p * j.steps.length))];
    return `<li class="${j.done ? 'done' : ''}"><div class="tr-row"><span class="kind ${j.kind}">${j.kind === 'game' ? 'New game' : 'Feature'}</span><b>${esc(j.name)}</b><span class="tl">${j.done ? 'Ready' : fmt((j.dur - j.elapsed) / state.speed)}</span></div>
      <div class="bar"><i style="width:${j.p * 100}%"></i></div><small>${j.done ? (j.kind === 'game' ? 'Finished · open it from the library' : 'Finished · reload the game to try it') : esc(step) + '…'}</small></li>`;
  }).join('');
  for (const t of $$('.tile.building', grid)) { const j = jobFor(t.dataset.id); if (j) { $('.pct', t).textContent = Math.round(j.p * 100) + '%'; $('.ring', t).style.setProperty('--p', j.p); } }
}
let last = performance.now();
setInterval(() => {
  const now = performance.now(), dt = (now - last) / 1000; last = now;
  let changed = false;
  for (const j of jobs) {
    if (j.done) continue;
    j.elapsed = Math.min(j.dur, j.elapsed + dt * state.speed); j.p = j.elapsed / j.dur; changed = true;
    if (j.elapsed >= j.dur) {
      j.done = true;
      const g = games.find(x => x.id === j.gameId);
      if (j.kind === 'game' && g) { g.status = 'ready'; g.updated = 'Just now'; g.badge = 'Ready'; if (state.screen === 'library') renderLibrary(); }
      toast(j.kind === 'game' ? `${j.name} is ready to play` : `${j.name} is ready. Reload the game to try it.`, true);
      setTimeout(() => { jobs.splice(jobs.indexOf(j), 1); renderTracker(); }, 15000);
    }
  }
  if (changed || jobs.length) renderTracker();
}, 250);

let toastT;
function toast(msg, good) { const t = $('#toast'); t.textContent = msg; t.className = good ? 'good show' : 'show'; clearTimeout(toastT); toastT = setTimeout(() => t.className = '', 3200); }

// ---------------- paint splatter backdrop ----------------
function splatters() {
  const cv = $('#splat'), d = Math.min(2, devicePixelRatio || 1); cv.width = innerWidth * d; cv.height = innerHeight * d;
  const c = cv.getContext('2d'), cols = ['#fb4934', '#fabd2f', '#b8bb26', '#83a598', '#d3869b', '#8ec07c', '#fe8019'];
  let s = 7; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const blob = (x, y, rad, col) => {
    c.fillStyle = col; c.globalAlpha = .5; c.beginPath();
    for (let i = 0; i <= 24; i++) { const a = i / 24 * 6.283, rr = rad * (.75 + r() * .5); i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.fill();
    for (let i = 0; i < 14; i++) { const a = r() * 6.283, dd = rad * (1.2 + r() * 1.8); c.beginPath(); c.arc(x + Math.cos(a) * dd, y + Math.sin(a) * dd, rad * (.04 + r() * .12), 0, 7); c.fill(); }
  };
  const W = cv.width, H = cv.height, R = Math.min(W, H) * .11;
  [[0, 0], [W, 0], [0, H], [W, H], [W * .5, -R * .3], [-R * .4, H * .5], [W + R * .3, H * .55]].forEach(([x, y], i) => { for (let k = 0; k < 3; k++) blob(x + (r() - .5) * R * 2, y + (r() - .5) * R * 2, R * (.5 + r() * .7), cols[(i * 3 + k) % cols.length]); });
}
addEventListener('resize', () => { clearTimeout(splatters.t); splatters.t = setTimeout(splatters, 150); });

// ---------------- boot ----------------
splatters();
games.push({ ...SEED_BUILD, status: 'building' });
await ready;
renderLibrary();
addJob('game', SEED_BUILD.title, SEED_BUILD.id, 150);
addJob('feature', 'Skyward Squadron · Boss rush mode', 'skyward-squadron', 12);
tr.dataset.state = 'collapsed'; renderTracker();
requestAnimationFrame(libraryLoop); requestAnimationFrame(montageLoop);
const hash = location.hash.slice(1);
if (hash === 'library') show('library');
else if (hash === 'new') { show('library'); startWizard(); }
else { loadTitle(); show('title'); }
