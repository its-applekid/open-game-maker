import { useEffect, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router';

import { Icon } from '../../components/Icon';
import { useSession } from '../../lib/api/session';
import { FocusZone, useFocusable, useInitialFocus } from '../../lib/input';
import { onChange, set, setMuted, status, unlock, type SoundStatus } from '../../lib/sound';
import { TitleTown } from './TitleTown';
import './title.css';

const SOUND_LABEL: Record<SoundStatus, string> = { on: 'Sound on', off: 'Sound off', tap: 'Tap to start sound' };

export function TitleScreen({ townSrc }: { townSrc?: string }) {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const sound = useSyncExternalStore(onChange, status);
  useInitialFocus('title-menu');

  useEffect(() => set('title'), []);

  const toggleSound = () => {
    if (sound === 'off') setMuted(false);
    else if (sound === 'on') setMuted(true);
    else unlock();
  };

  return (
    <div className="title-screen">
      <TitleTown active src={townSrc} />
      <h1 className="title-logo">
        <img src="/art/logo.webp" alt="Open Game Maker 2000" />
      </h1>
      <FocusZone id="title-menu" className="title-menu">
        <MenuButton
          className="title-start"
          onClick={() => navigate(session ? '/games' : `/age?next=${encodeURIComponent('/connect/github')}`)}
        >
          Start
        </MenuButton>
      </FocusZone>
      <button
        type="button"
        className="title-sound"
        aria-label={SOUND_LABEL[sound]}
        aria-pressed={sound === 'on'}
        onClick={toggleSound}
      >
        <Icon name={sound === 'on' ? 'soundOn' : 'soundOff'} />
      </button>
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
