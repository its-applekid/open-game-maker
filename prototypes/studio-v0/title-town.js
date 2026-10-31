// The title scene: the castle town (prototypes/title-city, copied to town/ by tools/build.sh) in a full-bleed frame behind
// the logo: a still view with every scene on its own loop. It is loaded only while the title shows: leaving the title
// removes it (and silences its sounds); coming back loads it again, from the local cache (sw.js). Until the town has
// drawn its first frame a looping poster of that same view plays (title-city/tools/poster.mjs), then the town fades in.
import { ext, extLoop, extSilence, titleReady } from './sound.js';

export function start({ el, active }) {
  let f = null;
  let poster = null;
  const load = () => {
    poster = el.querySelector('.t-poster');   // in the page's markup on first load (painted before any script); made again on a return
    if (!poster) { poster = document.createElement('div'); poster.className = 't-poster'; poster.innerHTML = `<img alt="" src="town/models/bake/poster-${innerWidth < innerHeight ? 'portrait' : 'landscape'}.webp">`; el.appendChild(poster); }
    el.classList.add('on');
    f = document.createElement('iframe');
    f.title = 'A castle town'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none';
    el.appendChild(f);
    const me = f;   // the town shares this page's thread: let the title music finish decoding first (at most 2.5 s)
    Promise.race([titleReady, new Promise(r => setTimeout(r, 2500))]).then(() => { if (f === me) f.src = 'town/index.html?cam=menu&scene=all&embed'; });
  };
  const sync = () => {
    const on = active();
    if (on && !f) load();
    else if (!on && f) { f.remove(); f = null; poster?.remove(); poster = null; el.classList.remove('on', 'live'); extSilence(); }
  };
  // the Easter egg: a tap on the town (not on the title's buttons) goes through to it, where the scenes check it
  el.closest('.screen')?.addEventListener('pointerdown', e => { if (!f || e.target.closest('button, a, input, [role="link"]')) return;
    const r = f.getBoundingClientRect(); f.contentWindow?.postMessage({ tap: [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] }, '*'); });
  addEventListener('message', e => {
    if (!f || e.source !== f.contentWindow) return;
    if (e.data === 'town-ready') { el.classList.add('live'); const p = poster; setTimeout(() => { p?.remove(); if (poster === p) poster = null; }, 1200); }   // the poster fades off the running town
    else if (e.data?.sfx) ext(`town/models/sounds/${e.data.sfx[0]}.mp3`, e.data.sfx[1], e.data.sfx[2]);   // the scenes' effects play on the studio's audio
    else if (e.data?.loop) extLoop(`town/models/sounds/${e.data.loop[0]}.mp3`, e.data.loop[1]);
  });
  sync();
  setInterval(sync, 500); document.addEventListener('visibilitychange', sync);
  return Promise.resolve({ wake: sync });
}
