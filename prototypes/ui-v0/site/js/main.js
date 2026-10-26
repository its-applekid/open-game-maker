import * as audio from './audio.js';
import { buildHome, startHome, makeGrain } from './home.js';

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
makeGrain();

const dungeon = import('./dungeon.js'); // three.js + models load while the home screen plays
let inHome = !params.has('editor');
let homeMusic = false;

const chip = $('#sound');
const updateChip = () => {
  chip.dataset.s = !audio.unlocked() ? 'tap' : audio.isMuted() ? 'off' : 'on';
  chip.textContent = { tap: '♪ Tap for sound', off: '♪ Sound off', on: '♪ Sound on' }[chip.dataset.s];
};
audio.onStateChange(updateChip); updateChip();
async function ensureAudio() {
  await audio.unlock(); await audio.ready;
  if (inHome && !homeMusic) { audio.music('music-home', { vol: 0.9 }); homeMusic = true; }
  updateChip();
}
// iOS only lets a touch start audio on touchend/pointerup, not pointerdown
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown']) addEventListener(ev, ensureAudio);
// a press on "Tap for sound" means sound on; later presses toggle. Go by the label the player saw at press time:
// the window listeners resume audio before click, and some browsers start it running before any tap at all.
let chipWasOn = null;
const noteChip = () => { chipWasOn = chip.dataset.s !== 'tap'; };
chip.addEventListener('pointerdown', noteChip); chip.addEventListener('keydown', noteChip);
chip.addEventListener('click', e => {
  e.stopPropagation();
  const wasOn = chipWasOn ?? chip.dataset.s !== 'tap'; chipWasOn = null;
  audio.setMuted(wasOn ? !audio.isMuted() : false); ensureAudio();
});

let clock = null;
if (inHome) clock = startHome(buildHome());
else enterEditor(true);

$('#start').addEventListener('click', async () => {
  if (!inHome) return; inHome = false;
  await ensureAudio();
  audio.play('confirmation_001', { vol: 0.8, pitch: 0 });
  const home = $('#home');
  ['L-front', 'L-near', 'L-mid', 'L-far', 'L-clouds', 'L-sun'].forEach((id, i) => $('#' + id).style.setProperty('--x', `${i * 0.06}s`));
  home.classList.add('out');
  audio.music(null, { fade: 1.6 });
  setTimeout(() => $('#wipe').classList.add('cover'), 420);
  setTimeout(() => enterEditor(false), 1150);
});

async function enterEditor(instant) {
  const ed = $('#editor');
  ed.hidden = false; ed.classList.add('pre');
  const mod = await dungeon;
  await mod.initEditor();
  clock?.stop(); $('#home').hidden = true;
  const wipe = $('#wipe');
  if (!instant) { wipe.classList.add('away'); setTimeout(() => wipe.remove(), 900); } else wipe.remove();
  requestAnimationFrame(() => requestAnimationFrame(() => ed.classList.remove('pre')));
  audio.ambience(true);
}
