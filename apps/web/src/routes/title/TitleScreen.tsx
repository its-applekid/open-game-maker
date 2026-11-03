import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { SoundControl } from '../../app/StudioChrome';
import { useSession } from '../../lib/api/session';
import { FocusZone, useFocusable, useInitialFocus } from '../../lib/input';
import { set, unlock } from '../../lib/sound';
import { TitleTown } from './TitleTown';
import './title.css';

const EXIT_MS = 450;

export function TitleScreen({ townSrc }: { townSrc?: string }) {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const leavingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [leaving, setLeaving] = useState(false);
  useInitialFocus('title-menu');

  useEffect(() => set('title'), []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const start = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    unlock();
    const destination = session ? '/games' : `/age?next=${encodeURIComponent('/connect/github')}`;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    timer.current = setTimeout(() => navigate(destination), reduced ? 0 : EXIT_MS);
  };

  return (
    <div className={`title-screen${leaving ? ' leaving' : ''}`}>
      <TitleTown active src={townSrc} />
      <h1 className="title-logo">
        <img src="/art/logo.webp" alt="Open Game Maker 2000" />
      </h1>
      <FocusZone id="title-menu" className="title-menu">
        <MenuButton className="title-start" onClick={start}>
          Start
        </MenuButton>
      </FocusZone>
      <SoundControl />
    </div>
  );
}

// a real or gamepad Enter on the focused button clicks it, so Norigin only moves focus here
function MenuButton({ className, onClick, children }: { className: string; onClick: () => void; children: string }) {
  const { ref } = useFocusable();
  return (
    <button ref={ref} type="button" className={className} onClick={onClick}>
      {children}
    </button>
  );
}
