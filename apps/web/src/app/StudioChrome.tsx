import { Link } from 'react-router';

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
