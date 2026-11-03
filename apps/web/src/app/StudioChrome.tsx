import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';

import { Icon } from '../components/Icon';
import { getVolume, onChange, setMuted, setVolume, status, unlock, type SoundStatus } from '../lib/sound';

const SOUND_LABEL: Record<SoundStatus, string> = {
  on: 'Sound on',
  off: 'Sound off',
  tap: 'Tap to start sound',
};

const GLOWS = [
  ['214,93,14', 0.32, 0.1, 0.1, 41],
  ['177,98,134', 0.3, 0.9, 0.15, 53],
  ['69,133,136', 0.34, 0.35, 0.95, 47],
  ['215,153,33', 0.2, 0.85, 0.9, 61],
  ['104,157,106', 0.16, 0.55, 0.45, 37],
] as const;

export function StudioBackdrop() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let last = -Infinity;

    const draw = (now: number) => {
      if (now - last >= 66 || reduced) {
        last = now;
        const width = context.canvas.width;
        const height = context.canvas.height;
        const time = reduced ? 0 : now / 1000;
        context.fillStyle = '#0f0e16';
        context.fillRect(0, 0, width, height);
        GLOWS.forEach(([rgb, alpha, x0, y0, period], index) => {
          const phase = (time / period) * Math.PI * 2;
          const x = (x0 + 0.16 * Math.sin(phase + index) + 0.06 * Math.sin(phase * 2.3)) * width;
          const y = (y0 + 0.14 * Math.cos(phase * 0.8 + index * 2)) * height;
          const radius = width * (0.42 + 0.08 * Math.sin(phase * 1.7));
          const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
          gradient.addColorStop(0, `rgba(${rgb},${alpha})`);
          gradient.addColorStop(0.55, `rgba(${rgb},${alpha * 0.45})`);
          gradient.addColorStop(1, `rgba(${rgb},0)`);
          context.fillStyle = gradient;
          context.fillRect(0, 0, width, height);
        });
      }
      if (!reduced) frame = requestAnimationFrame(draw);
    };

    draw(0);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="studio-backdrop" aria-hidden="true">
      <canvas ref={canvas} width="64" height="40" />
    </div>
  );
}

export function StudioLogo() {
  return (
    <Link className="studio-logo" to="/" aria-label="Open Game Maker 2000">
      <img src="/art/gm.webp" alt="" />
    </Link>
  );
}

export function SoundControl() {
  const root = useRef<HTMLDivElement>(null);
  const sound = useSyncExternalStore(onChange, status);
  const [open, setOpen] = useState(false);
  const [volume, setLocalVolume] = useState(getVolume);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const changeVolume = (next: number) => {
    setLocalVolume(next);
    setVolume(next);
  };

  return (
    <div ref={root} className="sound-control">
      <div className={`sound-volume${open ? ' open' : ''}`} aria-hidden={!open}>
        <button
          type="button"
          className="sound-mute"
          aria-label={sound === 'off' ? 'Unmute' : 'Mute'}
          tabIndex={open ? 0 : -1}
          onClick={() => setMuted(sound !== 'off')}
        >
          <Icon name={sound === 'on' ? 'soundOn' : 'soundOff'} />
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          aria-label="Volume"
          tabIndex={open ? 0 : -1}
          value={volume}
          onChange={(event) => changeVolume(Number(event.target.value))}
        />
      </div>
      <button
        type="button"
        className="sound-button"
        data-sound={sound}
        aria-label={SOUND_LABEL[sound]}
        aria-pressed={sound === 'on'}
        aria-expanded={open}
        onClick={() => {
          if (sound === 'tap') unlock();
          setOpen((current) => !current);
        }}
      >
        <Icon name={sound === 'on' ? 'soundOn' : 'soundOff'} />
      </button>
    </div>
  );
}
