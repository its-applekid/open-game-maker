// The title scene: the castle town (prototypes/title-city, copied to town/ by tools/build.sh) in a full-bleed frame behind
// the logo. It animates only while the title shows and the tab is visible.
import { ext, extLoop } from './sound.js';

export function start({ el, active }) {
  const f = document.createElement('iframe');
  f.src = 'town/index.html?cam=menu&scene=all&embed';   // still view, every scene on its own loop f.title = 'A castle town'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
  f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none';
  el.appendChild(f);
  let running = true;
  const sync = () => { const on = active(); if (on !== running) { running = on; f.contentWindow?.postMessage(on ? 'resume' : 'pause', '*'); } };
  addEventListener('message', e => {
    if (e.source !== f.contentWindow) return;
    if (e.data === 'town-ready') { el.classList.add('on'); sync(); }
    else if (e.data?.sfx) ext(`town/models/sounds/${e.data.sfx[0]}.mp3`, e.data.sfx[1], e.data.sfx[2]);   // the scenes' effects play on the studio's audio
    else if (e.data?.loop) extLoop(`town/models/sounds/${e.data.loop[0]}.mp3`, e.data.loop[1]);
  });
  setInterval(sync, 500); document.addEventListener('visibilitychange', sync);
  return Promise.resolve({ wake: sync });
}
