import * as audio from './audio.js';
import { buildHome, startHome, makeGrain } from './home.js';

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
makeGrain();

const dungeon = import('./dungeon.js'); // three.js + models load while the home screen plays
let inHome = !params.has('editor');
let homeMusic = false;

const chip = $('#sound');
const updateChip = () => { chip.textContent = !audio.unlocked() ? '♪ Tap for sound' : audio.isMuted() ? '♪ Sound off' : '♪ Sound on'; };
async function ensureAudio() {
  await audio.unlock(); await audio.ready;
  if (inHome && !homeMusic) { audio.music('music-home', { vol: 0.9 }); homeMusic = true; }
  updateChip();
}
addEventListener('pointerdown', ensureAudio);
addEventListener('keydown', ensureAudio);
chip.addEventListener('click', e => { e.stopPropagation(); if (audio.unlocked()) audio.setMuted(!audio.isMuted()); updateChip(); });

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
