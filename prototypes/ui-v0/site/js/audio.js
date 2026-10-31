// Tiny Web Audio mixer: buses (music / sfx / ambience) -> master, sample pool with pitch variation,
// music crossfades, and a synthesized torch crackle (Kenney has no fire loop).
const ctx = new (window.AudioContext || window.webkitAudioContext)();
const master = ctx.createGain(); master.connect(ctx.destination);
const bus = {};
for (const [k, v] of Object.entries({ music: 0.45, sfx: 0.8, amb: 0.6 })) { bus[k] = ctx.createGain(); bus[k].gain.value = v; bus[k].connect(master); }

const buffers = {};
const SFX = ['click_001', 'select_001', 'confirmation_001', 'drop_001', 'back_001', 'creak1', 'metalLatch', 'handleCoins',
  'doorOpen_1', 'drip1', 'drip2', 'drip3', 'setDown1', 'pickup1', 'swordMetal1', 'woosh1', 'woosh3',
  'impactPunch_heavy_000', 'impactPunch_medium_002', 'impactSoft_heavy_001', 'footstep_concrete_000', 'footstep_concrete_001',
  'jingles-pizzicato_00', 'jingles-pizzicato_03', 'jingles-pizzicato_10', 'music-home', 'music-play'];

async function load(name) {
  if (buffers[name]) return buffers[name];
  const res = await fetch(`assets/audio/${name}.mp3`);
  buffers[name] = await ctx.decodeAudioData(await res.arrayBuffer());
  return buffers[name];
}
export const ready = Promise.all(SFX.map(n => load(n).catch(e => console.warn('audio', n, e))));

let muted = false;
try { muted = localStorage.getItem('ogm-muted') === '1'; } catch {}
master.gain.value = muted ? 0 : 1;
export const isMuted = () => muted;
export function setMuted(m) {
  muted = m; master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05);
  try { localStorage.setItem('ogm-muted', m ? '1' : '0'); } catch {}
}
export const unlocked = () => ctx.state === 'running';
export const onStateChange = f => ctx.addEventListener('statechange', f);
export function unlock() {
  // iOS 17+: 'playback' keeps Web Audio playing when the ringer switch is on silent
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  if (ctx.state !== 'running') return ctx.resume(); return Promise.resolve();
}

export function play(name, { vol = 1, pitch = 0.06, rate = 1, busName = 'sfx' } = {}) {
  const b = buffers[name]; if (!b || ctx.state !== 'running') return;
  const s = ctx.createBufferSource(); s.buffer = b;
  s.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * pitch); // kill the machine-gun repeat
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(g).connect(bus[busName]); s.start();
}
export const playOneOf = (names, opts) => play(names[(Math.random() * names.length) | 0], opts);

// --- music: one track at a time, equal-ish crossfade
let current = null;
export function music(name, { fade = 1.2, vol = 1 } = {}) {
  const t = ctx.currentTime;
  if (current) { const old = current; old.g.gain.setTargetAtTime(0, t, fade / 4); setTimeout(() => old.s.stop(), fade * 2000); current = null; }
  if (!name || !buffers[name]) return;
  const s = ctx.createBufferSource(); s.buffer = buffers[name]; s.loop = true;
  const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(vol, t, fade / 4);
  s.connect(g).connect(bus.music); s.start();
  current = { s, g, name };
}

// --- ambience: fire crackle (noise bed + random pops) and cave drips
const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
{ const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
const fireGain = ctx.createGain(); fireGain.gain.value = 0; fireGain.connect(bus.amb);
let fireStarted = false, ambTimer = null;
function startFireBed() {
  if (fireStarted) return; fireStarted = true;
  const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 700;
  const g = ctx.createGain(); g.gain.value = 0.05;
  src.connect(bp).connect(g).connect(fireGain); src.start();
}
function pop() {
  const t = ctx.currentTime, dur = 0.01 + Math.random() * 0.03;
  const src = ctx.createBufferSource(); src.buffer = noise;
  const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 1500 + Math.random() * 3500; hp.Q.value = 2;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.25 + Math.random() * 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(hp).connect(g).connect(fireGain); src.start(t, Math.random(), dur + 0.02);
}
export function ambience(on, { fire = 0.7 } = {}) {
  clearInterval(ambTimer); ambTimer = null;
  fireGain.gain.setTargetAtTime(on ? fire : 0, ctx.currentTime, 0.4);
  if (!on) return;
  startFireBed();
  let nextDrip = ctx.currentTime + 3;
  ambTimer = setInterval(() => {
    if (ctx.state !== 'running') return;
    if (Math.random() < 0.35) pop();
    if (Math.random() < 0.08) { pop(); pop(); }
    if (ctx.currentTime > nextDrip) { playOneOf(['drip1', 'drip2', 'drip3'], { vol: 0.35, pitch: 0.15, busName: 'amb' }); nextDrip = ctx.currentTime + 4 + Math.random() * 6; }
  }, 60);
}
export const setFireLevel = v => fireGain.gain.setTargetAtTime(v, ctx.currentTime, 0.3);
