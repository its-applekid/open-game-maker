import { ctx, isMuted, node, sfxBus } from './context';

// Effects posted by an embedded scene (the title town): played here, on the audio the tap unlocked, never the iframe's.
const extBufs = new Map<string, Promise<AudioBuffer | null>>();
const extLoops = new Map<string, { g: GainNode }>();

function extLoad(url: string): Promise<AudioBuffer | null> {
  let buf = extBufs.get(url);
  if (!buf) {
    buf = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .catch(() => null);
    extBufs.set(url, buf);
  }
  return buf;
}

export function ext(url: string, vol: number, rate: number): void {
  if (ctx.state !== 'running' || isMuted()) return;
  void extLoad(url).then((b) => {
    if (!b) return;
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.playbackRate.value = rate;
    s.connect(node(sfxBus, vol));
    s.start();
  });
}

export function extLoop(url: string, gain: number): void {
  let l = extLoops.get(url);
  if (!l) {
    if (ctx.state !== 'running') return;
    const loop = (l = { g: node(sfxBus, 0) });
    extLoops.set(url, loop);
    void extLoad(url).then((b) => {
      if (!b) return;
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.loop = true;
      s.connect(loop.g);
      s.start();
    });
  }
  l.g.gain.value = gain;
}

// the embedded scene went away
export function extSilence(): void {
  for (const l of extLoops.values()) l.g.gain.value = 0;
}
