// The title scene: the castle town (prototypes/title-city, copied to town/ by tools/build.sh) in a full-bleed frame behind
// the logo: a still view with every scene on its own loop. It is loaded only while the title shows: leaving the title
// removes it (and silences its sounds); coming back loads it again, from the local cache (sw.js).
import { ext, extLoop, extSilence } from './sound.js';

export function start({ el, active }) {
  let f = null;
  const load = () => {
    f = document.createElement('iframe');
    f.src = 'town/index.html?cam=menu&scene=all&embed'; f.title = 'A castle town'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none';
    el.appendChild(f);
  };
  const sync = () => {
    const on = active();
    if (on && !f) load();
    else if (!on && f) { f.remove(); f = null; el.classList.remove('on'); extSilence(); }
  };
  addEventListener('message', e => {
    if (!f || e.source !== f.contentWindow) return;
    if (e.data === 'town-ready') el.classList.add('on');
    else if (e.data?.sfx) ext(`town/models/sounds/${e.data.sfx[0]}.mp3`, e.data.sfx[1], e.data.sfx[2]);   // the scenes' effects play on the studio's audio
    else if (e.data?.loop) extLoop(`town/models/sounds/${e.data.loop[0]}.mp3`, e.data.loop[1]);
  });
  sync();
  setInterval(sync, 500); document.addEventListener('visibilitychange', sync);
  return Promise.resolve({ wake: sync });
}
