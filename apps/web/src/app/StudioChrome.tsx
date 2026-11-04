import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';

import { Icon } from '../components/Icon';
import { getVolume, onChange, setMuted, setVolume, status, unlock, type SoundStatus } from '../lib/sound';

const SOUND_LABEL: Record<SoundStatus, string> = {
  on: 'Sound on',
  off: 'Sound off',
  tap: 'Tap to start sound',
};

export function StudioBackdrop() {
  return <div className="studio-backdrop" aria-hidden="true" />;
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
          aria-label={sound === 'on' ? 'Mute' : 'Unmute'}
          tabIndex={open ? 0 : -1}
          onClick={() => setMuted(sound === 'on')}
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
          if (sound === 'off') setMuted(false);
          setOpen((current) => !current);
        }}
      >
        <Icon name={sound === 'on' ? 'soundOn' : 'soundOff'} />
      </button>
    </div>
  );
}
