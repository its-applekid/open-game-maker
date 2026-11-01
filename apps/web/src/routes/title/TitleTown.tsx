import { useEffect, useRef, useState } from 'react';

import { registerTestApi } from '../../app/testHook';
import { ext, extLoop, extSilence, titleReady } from '../../lib/sound';

// The title scene (a port of prototypes/studio-v0/title-town.js): the castle town (public/town, built by tools/town.sh)
// in a full-bleed frame behind the title. It exists only while the title shows; leaving removes it and silences its
// sounds. Until the town has drawn its first frame a poster of that same view shows, then the town fades in under it.
// Protocol (T09 §4): parent→town {tap:[x,y]}, 'pause', 'resume'; town→parent 'town-ready', {sfx}, {loop}.
export const TOWN_SRC = '/town/index.html?cam=menu&scene=all&embed';
const POSTER = '/town/models/bake/poster';
const FADE_MS = 1200;
const DECODE_WAIT_MS = 2500;
const WATCHDOG_MS = 20000;
const SOUNDS = '/town/models/sounds';

type TownMessage = 'town-ready' | { sfx?: [string, number, number]; loop?: [string, number] };

let testApiRegistered = false;

export function TitleTown({ active, src = TOWN_SRC }: { active: boolean; src?: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [frameSrc, setFrameSrc] = useState<string>();
  const [live, setLive] = useState(false);
  const [poster, setPoster] = useState(true);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    // the town shares this page's thread: let the title music finish decoding first (at most 2.5 s)
    void Promise.race([titleReady, new Promise((r) => setTimeout(r, DECODE_WAIT_MS))]).then(() => {
      if (!cancelled) setFrameSrc(src);
    });
    let ready = false;
    const watchdog = setTimeout(() => {
      if (!ready) console.warn('title town: no town-ready after 20 s; keeping the poster');
    }, WATCHDOG_MS);
    let fade: ReturnType<typeof setTimeout> | undefined;

    const onMessage = (e: MessageEvent<TownMessage>) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const data = e.data;
      if (data === 'town-ready') {
        ready = true;
        setLive(true);
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        fade = setTimeout(() => setPoster(false), reduced ? 0 : FADE_MS);
      } else if (data && typeof data === 'object' && data.sfx) {
        ext(`${SOUNDS}/${data.sfx[0]}.mp3`, data.sfx[1], data.sfx[2]);
      } else if (data && typeof data === 'object' && data.loop) {
        extLoop(`${SOUNDS}/${data.loop[0]}.mp3`, data.loop[1]);
      }
    };
    // the Easter egg: a tap on the town (not on the title's controls) goes through to it, where the scenes check it
    const onPointerDown = (e: PointerEvent) => {
      const f = frame.current;
      if (!f?.contentWindow || (e.target as Element | null)?.closest?.('button, a, input, [role="link"]')) return;
      const r = f.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      f.contentWindow.postMessage(
        { tap: [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] },
        location.origin,
      );
    };
    const onVisibility = () =>
      frame.current?.contentWindow?.postMessage(document.hidden ? 'pause' : 'resume', location.origin);

    window.addEventListener('message', onMessage);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      clearTimeout(fade);
      window.removeEventListener('message', onMessage);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('visibilitychange', onVisibility);
      setFrameSrc(undefined);
      setLive(false);
      setPoster(true);
      extSilence();
    };
  }, [active, src]);

  useEffect(() => {
    if (testApiRegistered || !window.__ogmHost) return;
    testApiRegistered = true;
    registerTestApi('title', {
      live: () => document.querySelector('.title-town')?.classList.contains('live') ?? false,
    });
  }, []);

  const className = ['title-town', active && 'on', active && live && 'live'].filter(Boolean).join(' ');
  return (
    <div className={className} aria-hidden="true">
      {active && poster && (
        <picture className="t-poster">
          <source media="(orientation: portrait)" srcSet={`${POSTER}-portrait.webp`} />
          <img alt="" src={`${POSTER}-landscape.webp`} fetchPriority="high" />
        </picture>
      )}
      {active && <iframe ref={frame} title="A castle town" tabIndex={-1} src={frameSrc} />}
    </div>
  );
}
