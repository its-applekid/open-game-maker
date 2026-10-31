// The title scene: the castle town (prototypes/title-city, copied to town/ by tools/build.sh) in a full-bleed frame behind
// the logo. It animates only while the title shows and the tab is visible.
import { onChange, status } from './sound.js';

export function start({ el, active }) {
  const f = document.createElement('iframe');
  f.src = 'town/index.html?cam=menu&scene=all&embed';   // still view, every scene on its own loop f.title = 'A castle town'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
  f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none';
  el.appendChild(f);
  let running = true;
  const sync = () => { const on = active(); if (on !== running) { running = on; f.contentWindow?.postMessage(on ? 'resume' : 'pause', '*'); } };
  const sfx = s => f.contentWindow?.postMessage(s === 'on' ? 'sound-on' : 'sound-off', '*');   // the scenes' effects follow the studio's sound switch
  onChange(sfx);
  addEventListener('message', e => { if (e.source === f.contentWindow && e.data === 'town-ready') { el.classList.add('on'); sync(); sfx(status()); } });
  setInterval(sync, 500); document.addEventListener('visibilitychange', sync);
  return Promise.resolve({ wake: sync });
}
