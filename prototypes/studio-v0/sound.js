// Studio sound: one Web Audio context. Music crossfades between the title and menu tracks; selecting a game in the Games
// spotlight fades the music out and plays that game's sounds quietly (effects and ambience only, never its music).
// Effects are Kenney CC0 (sound packs); the title track is Sidetrax "Underground" and the menu track Sidetrax "Camelot" (Kevin's
// licence, personal use). tools/build.sh copies them to art/music, art/sfx.

// Swap a track by changing its file name here: any file in art/music (every Kenney Music Loops track is built there).
// A track with loop points plays its intro once, then loops seamlessly between them (seconds; from each track's asset card,
// audio.loop_points). fallback plays when the file isn't there.
export const MUSIC = { title: { file: 'underground', loop: [55.904, 133.898], fallback: 'space-cadet' }, menu: { file: 'camelot', loop: [42.983, 119.329], fallback: 'mishief-stroll' } };

// Gameplay sounds per game. bed: a quiet looping layer ('fire' and 'wind' are synthesized, anything else is a looped file);
// each event plays one of `s` every few seconds (`every` = [min, max] s), `n` times in a row `gap` s apart (footsteps), then
// optionally one of `then` (a sword hit after its swing). vol is per event; the whole layer sits well under the music level.
const steps = (s, n, gap, every, vol) => ({ s, n, gap, every, vol });
const SCAPES = {
  'goblin-cellar': { bed: ['fire', .6], events: [
    { s: ['drip1', 'drip2', 'drip3'], every: [2.5, 6], vol: .5, pitch: .15 },
    steps(['footstep_concrete_000', 'footstep_concrete_001'], [3, 5], .45, [4, 8], .4),
    { s: ['woosh1', 'woosh3'], then: ['swordMetal1', 'swordMetal2', 'swordMetal3'], gap: .14, every: [5, 10], vol: .5 },
    { s: ['impactPunch_medium_002'], every: [9, 16], vol: .35 }] },
  'crypt-crawlers': { bed: ['fire', .3], events: [
    steps(['footstep00', 'footstep01'], [3, 6], .32, [3, 6], .45),
    { s: ['woosh1', 'woosh3'], then: ['swordMetal1', 'swordMetal2', 'swordMetal3'], gap: .14, every: [4, 8], vol: .5 },
    { s: ['slime_000'], every: [6, 12], vol: .4 }, { s: ['handleCoins'], every: [12, 20], vol: .4 }] },
  'lantern-hollow': { bed: ['wind', .7], events: [
    { s: ['drip1', 'drip2', 'drip3'], every: [4, 9], vol: .45, pitch: .2 },
    { s: ['creak1', 'creak2'], every: [6, 12], vol: .4, rate: .8 },
    steps(['footstep_concrete_000', 'footstep_concrete_001'], [2, 3], .75, [7, 12], .3)] },
  restorebound: { bed: ['wind', .15], events: [
    steps(['impactWood_medium_000', 'impactWood_medium_001'], [3, 4], .38, [4, 8], .35),
    { s: ['chop'], every: [6, 11], vol: .45 },
    steps(['footstep_grass_000', 'footstep_grass_001'], [3, 5], .42, [6, 10], .35), { s: ['handleCoins'], every: [14, 22], vol: .35 }] },
  'mossy-leap': { events: [
    steps(['footstep_grass_000', 'footstep_grass_001'], [2, 4], .22, [3, 5], .3),
    { s: ['jump1', 'jump3'], every: [2, 5], vol: .35 }, { s: ['coin1', 'coin3'], every: [3, 6], vol: .3 }] },
  'frostbite-peaks': { bed: ['wind', .5], events: [
    steps(['footstep_snow_000', 'footstep_snow_001'], [2, 4], .4, [3, 6], .4), { s: ['jump1', 'jump3'], every: [4, 8], vol: .3 }] },
  'skyward-squadron': { bed: ['engine1', .22], events: [
    steps(['laser1', 'laser2'], [2, 4], .12, [1.5, 3], .25), { s: ['explosion2', 'explosion4'], every: [4, 8], vol: .35 }] },
  'nebula-run': { bed: ['spaceEngineLow_000', .35], events: [
    steps(['laserSmall_000', 'laserSmall_002'], [1, 3], .15, [1.5, 3], .3), { s: ['explosionCrunch_000'], every: [4, 8], vol: .4 }] },
  'powder-rush': { bed: ['wind', .45], events: [
    steps(['footstep_snow_000', 'footstep_snow_001'], [3, 5], .28, [2, 4], .4), { s: ['woosh1', 'woosh3'], every: [3, 6], vol: .35 }] },
  'little-fronts': { events: [
    steps(['footstep_concrete_000', 'footstep_concrete_001'], [4, 7], .5, [6, 10], .3),
    { s: ['impactMetal_heavy_001'], every: [5, 9], vol: .3 }, { s: ['explosion2'], every: [8, 14], vol: .25, rate: .7 }] },
  'turbo-tumble': { bed: ['engineCircular_000', .3], events: [
    { s: ['impactPlate_light_000'], every: [3, 7], vol: .35 }, { s: ['woosh1', 'woosh3'], every: [2, 5], vol: .3 }] },
  'brick-bloom': { events: [
    steps(['impactGlass_light_000', 'impactGlass_light_001'], [1, 3], .25, [1.5, 3], .35),
    { s: ['pepSound1'], every: [3, 6], vol: .3 }, { s: ['powerUp2'], every: [8, 14], vol: .25 }] },
  building: { events: [   // a game still being built: the workshop
    steps(['impactWood_medium_000', 'impactWood_medium_001'], [2, 4], .36, [3, 6], .35), { s: ['chop'], every: [5, 9], vol: .35 }] },
};

const ctx = new (window.AudioContext || window.webkitAudioContext)();
const node = (dest, v) => { const g = ctx.createGain(); g.gain.value = v; g.connect(dest); return g; };
let muted = false;
try { muted = localStorage.getItem('ogm-studio-sound') === 'off'; } catch {}
const master = node(ctx.destination, muted ? 0 : 1), musicBus = node(master, .5), sfxBus = node(master, .6);

const files = new Map();
const load = (dir, name) => {
  const key = `${dir}/${name}`;
  if (!files.has(key)) files.set(key, fetch(`art/${key}.mp3`).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).catch(e => { console.warn('sound', key, e); return null; }));
  return files.get(key);
};
const ramp = (g, v, s) => { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setTargetAtTime(v, ctx.currentTime, s / 4); };
const end = (layer, s) => { ramp(layer.g, 0, s); setTimeout(() => { layer.stop?.(); layer.g.disconnect(); }, s * 1000 + 200); };

// ---- music: one track at a time
let track = null;
const introDone = new Set();   // tracks whose intro has played: coming back to them starts at the loop
async function playMusic(def, fade) {
  const name = def?.file || def;
  if (track?.name === name) return;
  if (track) { end(track, fade); track = null; }
  if (!name) return;
  const me = track = { name, g: node(musicBus, 0) };
  let buf = await load('music', name), loop = def.loop;
  if (!buf && def.fallback) { buf = await load('music', def.fallback); loop = null; }
  if (track !== me || !buf) return;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  if (loop) { [src.loopStart, src.loopEnd] = loop; }
  src.connect(me.g); src.start(0, loop && introDone.has(name) ? loop[0] : 0); introDone.add(name);
  me.stop = () => src.stop(); ramp(me.g, 1, fade);
}

// ---- gameplay sounds
const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
{ const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
const rand = (a, b) => a + Math.random() * (b - a), pick = a => a[(Math.random() * a.length) | 0];
function shot(buf, dest, { vol = 1, pitch = .06, rate = 1, at = ctx.currentTime } = {}) {
  if (!buf) return;
  const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate * (1 + rand(-pitch, pitch));
  s.connect(node(dest, vol)); s.start(at);
}
function bed(kind, layer, vol) {
  const out = node(layer.g, vol), stops = [];
  const loopNoise = () => { const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true; n.start(); stops.push(() => n.stop()); return n; };
  if (kind === 'fire') {   // low rumble plus random pops (as in the dungeon prototype)
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    loopNoise().connect(lp).connect(node(out, .05));
    layer.tick = () => { if (Math.random() < .35) firePop(out); };
  } else if (kind === 'wind') {   // band-passed noise whose pitch and level drift slowly
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = .8;
    const swell = node(out, .12); loopNoise().connect(bp).connect(swell);
    for (const [param, f, depth] of [[bp.frequency, .07, 220], [swell.gain, .045, .07]]) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = f; lfo.connect(node(param, depth)); lfo.start(); stops.push(() => lfo.stop());
    }
  } else load('sfx', kind).then(buf => {
    if (!buf || layer.dead) return;
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(out); s.start(); stops.push(() => s.stop());
  });
  return () => stops.forEach(f => f());
}
function firePop(dest) {
  const t = ctx.currentTime, dur = .01 + Math.random() * .03, src = ctx.createBufferSource(); src.buffer = noise;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rand(1500, 5000); bp.Q.value = 2;
  const g = ctx.createGain(); g.gain.setValueAtTime(rand(.25, .75), t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  src.connect(bp).connect(g).connect(dest); src.start(t, Math.random(), dur + .02);
}
let scape = null;
function playScape(id, fade) {
  if (scape?.id === id) return;
  if (scape) { scape.dead = true; clearInterval(scape.timer); end(scape, fade); scape = null; }
  const def = id && (SCAPES[id] || SCAPES['goblin-cellar']);
  if (!def) return;
  const me = scape = { id, g: node(sfxBus, 0) }, bufs = {};
  for (const ev of def.events) for (const n of [...ev.s, ...(ev.then || [])]) load('sfx', n).then(b => { bufs[n] = b; });
  const stopBed = def.bed ? bed(def.bed[0], me, def.bed[1]) : null;
  me.stop = () => stopBed?.();
  const next = def.events.map(ev => ctx.currentTime + rand(.4, ev.every[0]));
  me.timer = setInterval(() => {
    if (ctx.state !== 'running') return;
    me.tick?.();
    def.events.forEach((ev, i) => {
      if (ctx.currentTime < next[i]) return;
      next[i] = ctx.currentTime + rand(...ev.every);
      const n = ev.n ? Math.round(rand(...ev.n)) : 1, first = (Math.random() * ev.s.length) | 0;
      for (let k = 0; k < n; k++) shot(bufs[ev.s[(first + k) % ev.s.length]], me.g, { vol: ev.vol, pitch: ev.pitch ?? .06, rate: ev.rate, at: ctx.currentTime + k * (ev.gap || 0) });
      if (ev.then) shot(bufs[pick(ev.then)], me.g, { vol: ev.vol, rate: ev.rate, at: ctx.currentTime + n * ev.gap });
    });
  }, 60);
  ramp(me.g, 1, fade);
}

// ---- what should be playing; applied again whenever the browser lets audio run
let want = { music: null, scape: null };
export function set(next, fade = 1.6) {
  want = { music: null, scape: null, ...next };
  if (ctx.state !== 'running') return;
  playMusic(want.music && MUSIC[want.music], fade);
  playScape(want.scape, fade);
}
export function cue(name, vol = .6) { if (ctx.state === 'running') load('sfx', name).then(b => shot(b, sfxBus, { vol, pitch: 0 })); }

// Browsers only start audio after a tap or key press (iOS on touchend/pointerup, not pointerdown).
const listeners = new Set();
export const onChange = f => listeners.add(f);
const notify = () => listeners.forEach(f => f(status()));
export const status = () => muted ? 'off' : ctx.state === 'running' ? 'on' : 'tap';
export function unlock() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}   // iOS: keep playing with the ringer on silent
  if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
}
ctx.addEventListener('statechange', () => { if (ctx.state === 'running') set(want, .8); notify(); });
for (const ev of ['pointerup', 'touchend', 'keydown', 'click']) addEventListener(ev, unlock, { capture: true });
export function setMuted(m) {
  muted = m; ramp(master, m ? 0 : 1, .2);
  try { localStorage.setItem('ogm-studio-sound', m ? 'off' : 'on'); } catch {}
  if (!m) unlock();
  notify();
}
// nothing plays in a background tab
let hiddenWhileOn = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenWhileOn = ctx.state === 'running'; if (hiddenWhileOn) ctx.suspend(); }
  else if (hiddenWhileOn) ctx.resume();
});
