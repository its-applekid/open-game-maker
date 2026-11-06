import { Link } from 'react-router';

import { InstanceLogo } from './InstanceLogo';

export function StudioBackdrop() {
  return <div className="studio-backdrop" aria-hidden="true" />;
}

export function StudioLogo() {
  return (
    <Link className="studio-logo" to="/" aria-label="Open Game Maker 2000">
      <InstanceLogo defaultSource="/art/gm.webp" alt="" />
    </Link>
  );
}
